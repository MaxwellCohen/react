'use client';
import {useActionState} from 'react';

async function save(prev, formData) {
  await Promise.resolve();
  return {count: prev.count + 1, last: String(formData.get('q'))};
}

export default function Form({children}) {
  const [state, action] = useActionState(save, {count: 0, last: ''});
  return (
    <form action={action}>
      {children}
      <input name="q" id="q" />
      <button type="submit" className="save">save</button>
      <output className="res">{state.count ? 'Saved: ' + state.last + ' (' + state.count + ')' : 'none'}</output>
    </form>
  );
}
