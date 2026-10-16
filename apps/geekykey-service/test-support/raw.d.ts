// A file imported with `?raw`, which Vite, under the tests, gives as its text.
declare module "*?raw" {
  const text: string;
  export default text;
}
