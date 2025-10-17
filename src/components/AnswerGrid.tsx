import React from "react";

export default function AnswerGrid({
  rows = 8,
  letters = "A B C D E F G H",
}: { rows?: number; letters?: string }) {
  const items = Array.from({ length: rows }, (_, i) => i + 1);
  return (
    <div className="answer-grid">
      {items.map((n) => (
        <div className="answer-item" key={n}>
          <span className="bubble">{n}</span>
          <span className="letters">{letters}</span>
        </div>
      ))}
    </div>
  );
}