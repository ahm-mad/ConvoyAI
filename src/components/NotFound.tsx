import { Link } from '@lib/router-compat';
import error404 from '../assets/svg/error404.svg';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center text-center px-4">
      <div className="mb-10 flex justify-center">
        <img src={error404} className="max-h-[160px]" alt="404" />
      </div>

      <span className="text-[16px] text-ink-2">404 Error</span>

      <h3 className="text-[24px] text-ink-0 font-semibold mb-2 font-display">
        We have lost this page
      </h3>

      <p className="text-base text-ink-1 mb-10">
        The requested page is missing. Check the URL or{' '}
        <Link to="/" className="text-accent-cyan font-medium hover:brightness-125">
          Return Home
        </Link>
        .
      </p>
    </div>
  );
}
