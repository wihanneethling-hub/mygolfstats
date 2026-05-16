import React from 'react';
import { Button, Badge, Input } from './UI';

export default function HoleEditor({ hole, isEditing, onEdit, onSave, onChange }) {
  if (isEditing) {
    return (
      <div className="hole-card">
        <div className="row-between">
          <div>
            <div className="muted small">Hole {hole.hole}</div>
            <div className="title-sm">Edit hole</div>
          </div>
          <Button className="btn-small" onClick={() => onSave(hole.hole)}>Save</Button>
        </div>

        <div className="grid-2">
          <div>
            <div className="muted tiny">Par</div>
            <Input value={hole.par} onChange={(e) => onChange(hole.hole, 'par', Number(e.target.value) || 0)} />
          </div>
          <div>
            <div className="muted tiny">Score</div>
            <Input value={hole.score} onChange={(e) => onChange(hole.hole, 'score', Number(e.target.value) || 0)} />
          </div>
          <div>
            <div className="muted tiny">Tee result</div>
            <Input value={hole.tee} onChange={(e) => onChange(hole.hole, 'tee', e.target.value)} />
          </div>
          <div>
            <div className="muted tiny">Approach miss</div>
            <Input value={hole.approachMiss} onChange={(e) => onChange(hole.hole, 'approachMiss', e.target.value)} />
          </div>
          <div>
            <div className="muted tiny">Putts</div>
            <Input value={hole.putts} onChange={(e) => onChange(hole.hole, 'putts', Number(e.target.value) || 0)} />
          </div>
          <div>
            <div className="muted tiny">1st putt ft</div>
            <Input value={hole.firstPuttFt ?? ''} onChange={(e) => onChange(hole.hole, 'firstPuttFt', e.target.value === '' ? null : Number(e.target.value))} />
          </div>
        </div>

        <div className="grid-2">
          <label className="switch-row">
            <span>GIR</span>
            <input type="checkbox" checked={hole.gir} onChange={(e) => onChange(hole.hole, 'gir', e.target.checked)} />
          </label>
          <label className="switch-row">
            <span>Up-and-down</span>
            <input type="checkbox" checked={hole.upAndDown} onChange={(e) => onChange(hole.hole, 'upAndDown', e.target.checked)} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="hole-card">
      <div className="row-between">
        <div>
          <div className="muted small">Hole {hole.hole}</div>
          <div className="badge-row">
  <Badge>Par {hole.par}</Badge>
  <Badge>Score {hole.score}</Badge>
  <Badge>Putts {hole.putts}</Badge>
  <Badge>{hole.gir ? 'GIR' : 'Missed GIR'}</Badge>
</div>
        </div>
        <Button variant="secondary" className="btn-small" onClick={() => onEdit(hole.hole)}>
          Edit
        </Button>
      </div>

      <div className="grid-2 text-sm">
  <div><div className="muted tiny">Tee</div><div>{hole.tee}</div></div>
  <div><div className="muted tiny">Approach miss</div><div>{hole.approachMiss}</div></div>
  <div><div className="muted tiny">Up-and-down</div><div>{hole.upAndDown ? 'Yes' : 'No'}</div></div>
  <div><div className="muted tiny">Putts</div><div>{hole.putts}</div></div>
  <div><div className="muted tiny">1st putt</div><div>{hole.firstPuttFt ? `${hole.firstPuttFt} ft` : 'Missing'}</div></div>
</div>
    </div>
  );
}
