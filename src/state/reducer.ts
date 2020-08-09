import State, {
  Project, ProjectNeed,
  ModelPV,
  ModelBattery,
  ModelOnduleur,
  ModelRegulateur
} from "./State";
import Actions from "./actions";
import { List } from "immutable";

type ProjectNeedJSON = ProjectNeed;

type ProjectJSON = Omit<State, 'projects'> & {
  needs: ProjectNeedJSON[];
}

type StateJSON = Omit<State, 'projects'> & {
  projects: ProjectJSON[]
};

const saved = localStorage.getItem("state");
const initial: State = saved ? decode(JSON.parse(saved)) : {
  projects: List()
};

export function mutateCalcProjectNeed(n: ProjectNeed) {
  n.energy = n.hours * (n.prolifiratedPower = n.quantity * n.power);
  return n;
}

function reduceProjectNeedsTotalEnergy(total: number, need: ProjectNeed) {
  return total + need.energy;
}

function reduceProjectNeedsProlifiratedPower(total: number, need: ProjectNeed) {
  return total + need.energy;
}

function calculateTotalEnergy(needs: List<ProjectNeed>) {
  return needs.reduce(reduceProjectNeedsTotalEnergy, 0);
}

function calculateProlifiratedPower(needs: List<ProjectNeed>) {
  return needs.reduce(reduceProjectNeedsProlifiratedPower, 0);
}

let projectID = initial.projects.reduce((maximum, project) => {
  return Math.max(maximum, project.id + 1);
}, 0);

const PSI = 1;

function calculatePc(Et: number, Eb: number, Kloss: number, Htilt: number) {
  return (Et / (Eb * Kloss * Htilt)) * PSI;
}

function calculateCx(Nc: number, El: number, DODmax: number, Vsystem: number, Ƞout: number) {
  return (Nc * El * 1000) / (DODmax * Vsystem * Ƞout);
}

export const BatteryModules: ModelBattery[] = [{
  model: "Solar 12V / 160 Ah",
  vendor: "Generic",
  Vnom: 12,
  Cnom: 160,
  Ƞ: 0.98
}, {
  model: "12-CS-11PS",
  vendor: "Rolls",
  Vnom: 12,
  Cnom: 296,
  Ƞ: 0.98
}];

export const PVModels: ModelPV[] = [{
  name: "SUNTECH 280Wc",
  Pm: 260,
  Voc: 38.2,
  Isc: 8.90,
  Vmp: 30.7,
  Imp: 8.47,
  output: 0.1598,
  temperture: [-40, +85],
  type: "Polycristalline"
}, {
  name: "TESLA POWER",
  Pm: 280,
  Voc: 38.2,
  Isc: 9.38,
  Vmp: 31.6,
  Imp: 8.86,
  output: 0.1710,
  temperture: [-40, +85],
  type: "Polycristalline"
}];

export const InverterModules: ModelOnduleur[] = [{
  vendor: "Generic",
  Pnom: 3,
  PVmpp: [125, 440],
  Vmax: 550,
  Ƞ: 0.97
}];

export const RegulatorModels: ModelRegulateur[] = [{
  name: "Xantex - 60A - 12V/24V",
  I: 60,
  Vout: 24
}];

// Ω

export const ρ = 1.724e-8;

export function calcS(I: number, L: number, Vd: number) {
  return 2e6 * ((ρ * I * L) / Vd);
}

export function calcVd(V: number) {
  return 0.04 * V;
}

export function calcVdmr(Voc: number, Msc: number) {
  return calcVd(Voc * Msc * 1.15);
}

export function calcIbi(Pi: number, Ƞ: number, Vsystem: number) {
  return 1000 * Pi / (Ƞ * Vsystem);
}

const SQRT3 = Math.sqrt(3);
const VLOAD = 220;

export function calcIic(Pi: number) {
  return Pi / (VLOAD * SQRT3);
}

export const Vdic = calcVd(VLOAD);

function mutateUpdateProject(project: Project) {



  const Vsystem = project.Vsystem;

  const Pc = project.Pc = calculatePc(
    project.El, project.Ƞb,
    project.Kloss, project.Htilt
  );

  const module = project.module;

  const PV = module === -1 ? null : PVModels[module];
  const Isc = PV ? PV.Isc : NaN;

  const Msc = project.Msc = (PV ? Math.ceil(Vsystem / PV.Vmp) : NaN);
  const Mpc = project.Mpc = (PV && Msc !== 0 ? Math.ceil(Pc / (Msc * PV.Pm)) : NaN);
  project.Mt = Mpc * Msc;

  const Nc = project.Nc;
  const DODmax = project.DODmax;
  const Ƞout = project.Ƞout;

  const battery = project.battery;

  const B = battery === -1 ? null : BatteryModules[battery];

  const Cx = project.Cx = calculateCx(Nc, project.El, DODmax, Vsystem, Ƞout);

  const Bt = project.Bt = (B ? Math.ceil(Cx / B.Cnom) : NaN);
  const Bsc = project.Bsc = (B ? Math.ceil(Vsystem / B.Vnom) : NaN);
  project.Bpc = Math.floor(Bt / Bsc);

  project.Pi = project.Pf * 1.25;

  const Irated = project.Irated = Isc * Mpc * 1.25;
  const regulator = project.regulator;

  const R = regulator === -1 ? null : RegulatorModels[regulator];

  project.Rc = Math.ceil(Irated / (R?.I ?? NaN));

  return project;

}

function reducer(state = initial, action: Actions): State {
  switch (action.type) {
    case "project:set": {
      const { id, name, value } = action.payload;

      const project = {
        ...state.projects.get(id)!,
        [name]: value
      } as Project;

      return {
        ...state,
        projects: state.projects.set(id,
          mutateUpdateProject(project)
        )
      };

    }
    case "project.needs:set": {
      const { id, needs } = action.payload;
      const projet = state.projects.get(id)!;
      const $needs = needs.map(need => mutateCalcProjectNeed({ ...need }));
      return {
        ...state,
        projects: state.projects.set(id, mutateUpdateProject({
          ...projet,
          needs: $needs,
          El: calculateTotalEnergy($needs),
          Pf: calculateProlifiratedPower($needs),
        } as Project))
      };
    }
    case "project:delete": {
      const { id } = action.payload;
      return {
        ...state,
        projects: state.projects.filter(project => {
          return project.id !== id;
        })
      };
    };
    case "project:edit": {
      const { id, name, site } = action.payload;
      return {
        ...state,
        projects: state.projects.set(id, {
          ...state.projects.get(id),
          id, name, site
        } as Project)
      };
    };
    case "project:create": {
      const { name, site } = action.payload;
      return {
        ...state,
        projects: state.projects.push({
          id: projectID++,
          name, site,
          needs: List(),
          El: 0,
          Pf: 0,
          Htilt: 0,
          Kloss: 0,
          Mpc: 0,
          Msc: 0,
          Mt: 0,
          Pc: 0,
          Vsystem: 0,
          module: -1,
          battery: -1,
          inverter: -1,
          regulator: -1,
          Ƞb: 0,
          Nc: 0,
          DODmax: 0.01,
          Ƞout: 0.01,
          Cx: 0,
          Bpc: 0,
          Bsc: 0,
          Bt: 0,
          Pi: 0,
          Irated: 0,
          Rc: 0,
          Lmr: 0,
          Lbi: 0,
          Lic: 0,
          Idmr: 0,
          Idbi: 0,
          Idic: 0,
          Sdmr: 0,
          Sdbi: 0,
          Sdic: 0,
        })
      };
    };
    default: return state;
  }
}

function encode(state: State): StateJSON {
  return {
    projects: state.projects.map(project => ({
      ...project,
      needs: project.needs.toArray()
    } as ProjectJSON)).toArray()
  };
}

function decode(state: StateJSON): State {
  return {
    projects: List(state.projects.map(project => ({
      ...project,
      needs: List(project.needs)
    }))) as List<Project>
  };
}

export default function (state = initial, action: Actions) {
  const next = reducer(state, action);
  localStorage.setItem("state", JSON.stringify(encode(next)));
  return next;
};
