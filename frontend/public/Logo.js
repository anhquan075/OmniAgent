import * as React from "react";
const SvgLogo = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 200 200"
    {...props}
  >
    <rect width={200} height={200} fill="#0a1628" rx={40} />
    <path
      fill="#1a2540"
      stroke="#f5a623"
      strokeLinejoin="round"
      strokeWidth={4.5}
      d="m100 22 66 28v54c0 36-30 62-66 74-36-12-66-38-66-74V50Z"
    />
    <path
      stroke="#f5a623"
      strokeLinecap="round"
      strokeWidth={2.5}
      d="M60 72h20m40 0h20M55 130h20m50 0h20M60 72v18m-5 40v-18M140 72v18m5 40v-18"
    />
    <circle cx={60} cy={72} r={4} fill="#00d4aa" />
    <circle cx={140} cy={72} r={4} fill="#00d4aa" />
    <circle cx={55} cy={130} r={4} fill="#00d4aa" />
    <circle cx={145} cy={130} r={4} fill="#00d4aa" />
    <circle cx={100} cy={62} r={3} fill="#f5a623" />
    <circle cx={100} cy={138} r={3} fill="#f5a623" />
    <circle cx={100} cy={100} r={38} stroke="#2a3a5c" strokeWidth={8} />
    <circle cx={100} cy={62} r={6} fill="#f5a623" />
    <circle cx={133} cy={81} r={6} fill="#f5a623" />
    <circle cx={133} cy={119} r={6} fill="#f5a623" />
    <circle cx={100} cy={138} r={6} fill="#f5a623" />
    <circle cx={67} cy={119} r={6} fill="#f5a623" />
    <circle cx={67} cy={81} r={6} fill="#f5a623" />
    <circle
      cx={100}
      cy={100}
      r={26}
      fill="#0d1c30"
      stroke="#3a4e72"
      strokeWidth={3}
    />
    <path
      stroke="#00d4aa"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={5.5}
      d="m84 100 11 11 23-23"
    />
    <rect width={7} height={24} x={46} y={88} fill="#6b7280" rx={3.5} />
    <rect width={4} height={7} x={44} y={88} fill="#f5a623" rx={2} />
    <rect width={4} height={7} x={44} y={105} fill="#f5a623" rx={2} />
  </svg>
);
export default SvgLogo;
