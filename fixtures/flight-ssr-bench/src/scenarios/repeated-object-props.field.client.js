'use client';

export default function ConfigField({config}) {
  return (
    <div className="cfg">
      <span className="name">{config.name}</span>
      <span className="region">{config.region}</span>
    </div>
  );
}
