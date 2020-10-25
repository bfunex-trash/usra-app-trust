import React from "react";
import { Link } from "react-router-dom";

export interface ChoiceItem {
  name: string;
}

export default function ChoiceBox({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: ChoiceItem[];
  value: number;
  onChange(value: number): void;
}) {
  return (
    <div className="mb-3 row">
      <label className="offset-sm-2 col-sm-4 col-form-label">{label}:</label>
      <div className="col-sm-4">
        <div className="input-group">
          <select
            className="form-select form-select-sm"
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
          >
            <option value={-1}></option>
            {items.map((item, index) => {
              return (
                <option key={index} value={index}>
                  {item.name}
                </option>
              );
            })}
          </select>
          <Link to="/models" className="btn btn-outline-secondary btn-sm">
            ⋮
          </Link>
        </div>
      </div>
    </div>
  );
}
