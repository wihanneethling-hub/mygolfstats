import React from 'react';

export default function PlayerPicker({ players, selectedPlayer, onSelect }) {
  return (
    <div className="player-list">
      {players.map((player) => {
        const active = selectedPlayer === player;
        return (
          <button
            key={player}
            onClick={() => onSelect(player)}
            className={`player-chip ${active ? 'player-chip-active' : ''}`}
          >
            ⛳ {player}
          </button>
        );
      })}
    </div>
  );
}
