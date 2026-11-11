'use client';

import {useState} from 'react';

export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        setSent(email);
      }}>
      <label htmlFor="newsletter-email">Email</label>
      <input
        id="newsletter-email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <button type="button" className="newsletter-submit" onClick={() => setSent(email)}>
        Subscribe
      </button>
      <p className="newsletter-status">{sent ? 'Subscribed: ' + sent : 'Not subscribed'}</p>
    </form>
  );
}
