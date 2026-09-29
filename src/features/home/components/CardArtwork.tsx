import { useId } from "react";

export type Destination = "browse" | "play" | "editor";

export function CardArtwork({ kind }: { kind: Destination }) {
  const orb = useId();
  return <svg className="notsu-card-art" viewBox="0 0 320 300" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={orb} cx="32%" cy="25%" r="80%">
        <stop stopColor="#72f9ff" />
        <stop offset=".55" stopColor="#00e1ec" />
        <stop offset="1" stopColor="#00b8c9" />
      </radialGradient>
    </defs>
    {kind === "play" && <>
      <path d="M22 270 298 31" stroke="#737e80" strokeWidth="1.5" />
      <path d="m55 242 211-184" stroke="#657174" strokeWidth="3" />
      <circle cx="55" cy="241" r="12" fill={`url(#${orb})`} />
      <circle cx="119" cy="186" r="18" fill={`url(#${orb})`} />
      <circle cx="193" cy="122" r="33" fill="#0d1213" fillOpacity=".65" stroke="var(--home-accent)" strokeWidth="2.5" />
      <circle cx="193" cy="122" r="11" fill={`url(#${orb})`} />
      <circle cx="266" cy="59" r="13" fill={`url(#${orb})`} />
    </>}
    {kind === "browse" && <>
      <path d="m34 90 93-14 1 173-94-8Z" fill="#0c1112" stroke="#3c484b" />
      <path d="m205 74 79 7v160l-78 8Z" fill="#0c1112" stroke="#3c484b" />
      <path d="m96 58 108-17a5 5 0 0 1 6 5v210a5 5 0 0 1-5 5l-108-6a5 5 0 0 1-5-5V64a6 6 0 0 1 4-6Z" fill="#0e1415" stroke="#596366" />
      <g stroke="var(--home-accent)" strokeWidth="1.4">
        <path d="m45 191 39-43m24 34 65-75m55 70 43-48" stroke="#7b8b8e" />
        <circle cx="53" cy="182" r="4" fill={`url(#${orb})`} /><circle cx="66" cy="169" r="7" /><circle cx="79" cy="154" r="4" fill={`url(#${orb})`} />
        <circle cx="119" cy="168" r="5" fill={`url(#${orb})`} /><circle cx="142" cy="143" r="11" /><circle cx="142" cy="143" r="5" fill={`url(#${orb})`} /><circle cx="164" cy="118" r="6" fill={`url(#${orb})`} />
        <circle cx="232" cy="174" r="4" fill={`url(#${orb})`} /><circle cx="248" cy="156" r="7" /><circle cx="264" cy="138" r="4" fill={`url(#${orb})`} />
      </g>
      <circle cx="199" cy="211" r="36" fill="#0b1011" fillOpacity=".7" stroke="var(--home-accent)" strokeWidth="3" />
      <path d="m224 238 24 27" stroke="var(--home-accent)" strokeWidth="6" strokeLinecap="round" />
    </>}
    {kind === "editor" && <>
      <path d="M62 43v218M123 43v218M184 43v218M245 43v218M27 78h253M27 133h253M27 188h253M27 243h253" stroke="#394447" strokeWidth="1.2" />
      <circle cx="62" cy="243" r="12" fill={`url(#${orb})`} />
      <circle cx="123" cy="188" r="13" fill={`url(#${orb})`} />
      <circle cx="245" cy="106" r="13" fill={`url(#${orb})`} />
    </>}
  </svg>;
}
