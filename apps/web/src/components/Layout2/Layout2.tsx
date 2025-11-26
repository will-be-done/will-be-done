export const Layout2 = ({ children }: { children?: React.ReactNode }) => {
  return (
    <div className="w-full h-screen bg-surface overflow-hidden flex">
      {children}
    </div>
  );
};
