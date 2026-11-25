'use client';

export default function Boom() {
  if (typeof window === 'undefined') throw new Error('boom: server only');
  return <span className="boom">client rendered</span>;
}
