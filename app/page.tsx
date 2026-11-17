import Script from 'next/script';
import shell from './shell';
export default function Page() { return <><div dangerouslySetInnerHTML={{__html:shell}} /><Script src="/app.mjs" type="module" strategy="afterInteractive" /></>; }
