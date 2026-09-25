export default function SpinLoader() {
  return (
    <div className="fixed inset-0 bg-black/30 z-1000 flex items-center justify-center ">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}
