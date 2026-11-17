import './globals.css';
export const metadata = { title: 'Окно вылета', description: 'Ограничения аэропортов по сообщениям Росавиации. История — не прогноз.' };
export default function Layout({ children }: {children: React.ReactNode}) { return <html lang="ru"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" /></head><body>{children}</body></html>; }
