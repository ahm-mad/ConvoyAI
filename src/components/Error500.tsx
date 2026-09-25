import { Link } from '@lib/router-compat';
import error500 from '../assets/svg/error500.svg';

export default function Error500() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 -translate-y-4">
      <div className="mb-12 flex justify-center">
        <img src={error500} className="dark:hidden max-h-[160px]" alt="image" />
        <img src={error500} className="hidden dark:block max-h-[160px]" alt="image" />
      </div>

      <div className="flex justify-center rounded-md border border-[#e8dde9] bg-[#FFF0F0] mb-3">
        <button className="text-xs font-medium  h-[24px]  w-[66px] text-[#e7000b]">
          500 Error
        </button>
      </div>

      <h3 className="text-2xl text-[#0B0909] font-semibold text-mono mb-2">
        Internal Server Error
      </h3>

      <p className="text-base text-[#654A55] text-secondary-foreground mb-[40px]">
        Server error occurred. Please try again later or{' '}
        <span className="text-primary font-medium cursor-pointer">Contact Us</span> for assistance.
      </p>

      <div className="flex justify-center">
        <Link
          to="/"
          className="text-[13px] h-[34px] bg-[#1379F0] font-medium rounded-md px-[12px] text-white flex items-center"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
