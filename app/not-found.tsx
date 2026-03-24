import Link from 'next/link';
import { FaArrowLeft } from 'react-icons/fa';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl text-center">
        <div className="card-glow p-8 md:p-10 rounded-2xl">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 text-3xl font-extrabold"
            style={{
              background: 'var(--tg-subtle)',
              color: 'var(--primary)',
              border: '1px solid var(--tg-border-primary)',
            }}
          >
            404
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold text-theme">
            Page Not Found
          </h1>
          <p className="mt-3 text-muted-theme text-sm md:text-base">
            The page you are looking for does not exist or the link may be
            broken.
          </p>

          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: 'var(--primary)' }}
            >
              <FaArrowLeft size={12} /> Go back to homepage
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
