import Link from 'next/link';
export default function Home() {
  return (
    <main className='p-6'>
      <h1 className='text-2xl font-semibold mb-4'>Aontas 6.0</h1>
      <Link className='underline' href='/generate'>Open Builder ?</Link>
    </main>
  );
}
