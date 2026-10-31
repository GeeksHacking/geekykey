/** The avatar as one flat picture: the first paint, and all a phone without WebGL shows. */
export function FlatAvatar({ url }: { url: string }) {
  return (
    <img
      src={url}
      alt=""
      className="mx-auto h-full max-w-full object-contain [image-rendering:pixelated]"
    />
  );
}
