import Link from "next/link";

export default function Brand({ href = "/admin/dashboard", light = false }) {
  return <Link className={`pp-brand${light ? " pp-brand-light" : ""}`} href={href} aria-label="PeoplePay360 home">
    <span className="pp-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
    <span>PeoplePay<span className="pp-brand-360">360</span><small>HR & PAYROLL</small></span>
  </Link>;
}
