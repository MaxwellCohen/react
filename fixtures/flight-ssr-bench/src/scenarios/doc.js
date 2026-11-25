// Whole-document shell: scenario roots render <html> (the client hydrates `document`).
export function Document({title, head, children}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{title}</title>
        {head}
      </head>
      <body>{children}</body>
    </html>
  );
}
