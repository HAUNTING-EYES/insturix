import Tiles from "./Tiles";

export default function Background() {
  return <AnimatedGridBackgroundSection />;
}

function AnimatedGridBackgroundSection({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="w-full h-full min-h-[400px] relative overflow-hidden flex items-center justify-center">
      <div className="w-fit h-fit relative z-[2]">{children}</div>
      <div className="absolute top-0 left-0 h-full w-full">
        <Tiles cols={49} rows={37} />
      </div>
    </div>
  );
}
