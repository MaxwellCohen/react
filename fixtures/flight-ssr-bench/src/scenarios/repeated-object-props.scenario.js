import {Document} from './doc';
import ConfigField from './repeated-object-props.field.client';

export const id = 'repeated-object-props';
export const title = 'Repeated object props';
export const category = 'client';
export const description =
  'One shared 30-key config object is passed as the same prop to `size` client components, each rendering two of its fields.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 5, full: 300};

const CONFIG = {
  name: 'alpha',
  region: 'eu-west-1',
  tier: 'standard',
  owner: 'platform',
  version: 'v1',
  environment: 'production',
  cluster: 'c-01',
  namespace: 'apps',
  runtime: 'node',
  memory: '512Mi',
  cpu: '250m',
  replicas: '3',
  timeout: '30s',
  retries: '5',
  protocol: 'https',
  port: '8443',
  logLevel: 'info',
  trace: 'enabled',
  metrics: 'prometheus',
  storage: 'ssd',
  encryption: 'aes256',
  backup: 'nightly',
  billing: 'monthly',
  zone: 'z-a',
  network: 'vpc-1',
  ingress: 'edge',
  egress: 'proxy',
  auth: 'oidc',
  release: 'stable',
  channel: 'canary',
};

export function Root({size}) {
  return (
    <Document title="Repeated object props">
      <main>
        <h1>Repeated object props</h1>
        <div className="grid">
          {Array.from({length: size}, (_, i) => (
            <ConfigField key={i} config={CONFIG} />
          ))}
        </div>
      </main>
    </Document>
  );
}

export const interact = [
  {expectCount: {selector: 'div.cfg', count: 'size'}},
  {expectText: {selector: 'div.cfg span.name', text: 'alpha'}},
  {expectText: {selector: 'div.cfg span.region', text: 'eu-west-1'}},
];
