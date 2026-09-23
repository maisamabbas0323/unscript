/**
 * Minimal ANSI color helpers.
 *
 * Color is used deliberately and sparingly. Output is automatically
 * uncolored when it is not a terminal or when NO_COLOR is set
 * (https://no-color.org/). Nothing fancy — no gradients, no emoji.
 */

export interface StreamLike {
  isTTY?: boolean;
}

function streamEnabled(stream: StreamLike): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
    return false;
  }
  return stream.isTTY === true;
}

type Paint = (text: string, stream?: StreamLike) => string;

function ansi(open: string, close: string): Paint {
  return (text, stream = process.stdout) => {
    if (!streamEnabled(stream)) return text;
    return `\u001b[${open}m${text}\u001b[${close}m`;
  };
}

export const colors = {
  bold: ansi('1', '22'),
  dim: ansi('2', '22'),
  red: ansi('31', '39'),
  green: ansi('32', '39'),
  yellow: ansi('33', '39'),
  cyan: ansi('36', '39'),
  gray: ansi('90', '39'),
};
