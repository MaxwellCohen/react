'use client';

export default function LongCell({value}) {
  return (
    <div className="long-cell" data-chars={value.length}>
      {value.length} chars
    </div>
  );
}
