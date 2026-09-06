"use client";
import { useState } from "react";
import { ArrowUpRight, CreditCard, FileText } from "lucide-react";
import { employeeApi } from "@/services/employee.service";
import {
  Badge,
  Details,
  Dialog,
  DownloadButton,
  Empty,
  Panel,
  ResourceState,
  dateLabel,
  human,
  money,
  number,
  useEmployeeResource,
} from "./shared";

export function EmployeeContracts({ revision, refresh }) {
  const resource = useEmployeeResource(employeeApi.contracts, {}, revision);
  if (!resource.data)
    return <ResourceState resource={resource} onRetry={refresh} />;
  return (
    <div className="emp-stack">
      {resource.data.length ? (
        resource.data.map((contract) => (
          <Panel
            key={contract.id}
            title={contract.name}
            description={contract.reference}
            action={<Badge value={contract.status} />}
          >
            <div className="emp-panel-body">
              <Details
                items={[
                  ["Start date", dateLabel(contract.startDate)],
                  [
                    "End date",
                    contract.endDate
                      ? dateLabel(contract.endDate)
                      : "Open ended",
                  ],
                  [
                    "Wage",
                    `${money(contract.wage, contract.currency)} / ${human(contract.wageBasis)}`,
                  ],
                  ["Pay frequency", human(contract.payFrequency)],
                  ["Employment type", human(contract.employeeType)],
                  ["Department", contract.department?.name],
                  ["Position", contract.jobPosition?.title],
                  ["Schedule", contract.workingSchedule?.name],
                  ["Salary structure", contract.salaryStructure?.name],
                  ["Probation ends", dateLabel(contract.probationEndDate)],
                  ["Signed", dateLabel(contract.signedAt)],
                  ["Termination date", dateLabel(contract.terminationDate)],
                ]}
              />
              {contract.terms && (
                <div className="emp-contract-terms">
                  <h3>Contract terms</h3>
                  <p>{contract.terms}</p>
                </div>
              )}
            </div>
          </Panel>
        ))
      ) : (
        <Panel title="My contracts">
          <Empty title="No published contracts yet">
            Your HR team will publish your employment contract here.
          </Empty>
        </Panel>
      )}
    </div>
  );
}

function PayslipDetails({ id, onClose }) {
  const [revision, setRevision] = useState(0),
    [error, setError] = useState("");
  const resource = useEmployeeResource(employeeApi.payslip, { id }, revision),
    slip = resource.data;
  return (
    <Dialog
      title={slip ? `Payslip ${slip.number}` : "Payslip details"}
      onClose={onClose}
    >
      {!slip ? (
        <ResourceState
          resource={resource}
          onRetry={() => setRevision((v) => v + 1)}
        />
      ) : (
        <div className="emp-stack emp-dialog-content">
          <Details
            items={[
              [
                "Period",
                `${dateLabel(slip.periodStart)} – ${dateLabel(slip.periodEnd)}`,
              ],
              ["Status", <Badge key="status" value={slip.status} />],
              ["Gross salary", money(slip.grossAmount, slip.currency)],
              ["Deductions", money(slip.deductionAmount, slip.currency)],
              ["Net salary", money(slip.netAmount, slip.currency)],
              ["Worked hours", number(slip.workedHours)],
            ]}
          />
          <h3>Salary components</h3>
          <div className="pp-table-scroll">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {slip.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.name}
                      <small>{line.code}</small>
                    </td>
                    <td>{human(line.effect)}</td>
                    <td>{number(line.quantity)}</td>
                    <td>{money(line.total, slip.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Worked time</h3>
          {slip.workedTime.length ? (
            <div className="pp-table-scroll">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Days</th>
                    <th>Hours</th>
                    <th>Paid %</th>
                  </tr>
                </thead>
                <tbody>
                  {slip.workedTime.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{number(row.days)}</td>
                      <td>{number(row.hours)}</td>
                      <td>{number(row.paidPercentage)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No worked-time breakdown recorded.</p>
          )}
          <h3>Payment history</h3>
          {slip.payments.length ? (
            <div className="pp-table-scroll">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {slip.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{dateLabel(payment.paidAt)}</td>
                      <td>{human(payment.method)}</td>
                      <td>{money(payment.amount, payment.currency)}</td>
                      <td>
                        <Badge value={payment.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Payment has not been recorded yet.</p>
          )}
          {error && (
            <div className="pp-error" role="alert">
              {error}
            </div>
          )}
          <div className="pp-dialog-actions">
            <DownloadButton
              kind="payslip"
              id={id}
              fileName={`payslip-${id}.pdf`}
              label="Download PDF"
              onError={setError}
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}

export default function EmployeePayroll({
  section,
  revision,
  refresh,
  navigate,
  initialYear,
}) {
  const [year, setYear] = useState(initialYear || new Date().getFullYear()),
    [selected, setSelected] = useState(null),
    [error, setError] = useState("");
  const resource = useEmployeeResource(employeeApi.payroll, { year }, revision),
    data = resource.data;
  const latest = data?.slips[0];
  const pendingSlips = data?.pendingSlips || [];
  return (
    <div className="emp-stack">
      <div className="emp-toolbar pp-form">
        <label>
          Payroll year{" "}
          <input
            type="number"
            min="2000"
            max="2099"
            value={year}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value >= 2000 && value <= 2099) setYear(value);
            }}
          />
        </label>
        {data?.years.map((y) => (
          <button
            key={y}
            className="pp-button pp-button-outline"
            aria-pressed={year === y}
            onClick={() => setYear(y)}
          >
            {y}
          </button>
        ))}
      </div>
      {error && (
        <div className="pp-error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <ResourceState resource={resource} onRetry={refresh} />
      ) : (
        <>
          {section === "payroll" && (
            <>
              <section className="emp-payroll-hero pp-panel">
                <div>
                  <p className="pp-eyebrow">LATEST RELEASED PAYSLIP · {year}</p>
                  <h2>
                    {latest
                      ? money(latest.netAmount, latest.currency)
                      : pendingSlips.length
                        ? "Payroll in progress"
                        : "No payslip yet"}
                  </h2>
                  <p>
                    {latest
                      ? `${dateLabel(latest.periodStart)} – ${dateLabel(latest.periodEnd)}`
                      : "Your salary summary appears after payroll validation."}
                  </p>
                  {latest && <Badge value={latest.status} />}
                </div>
                <CreditCard size={44} />
                {latest && (
                  <button
                    className="pp-button pp-button-primary"
                    onClick={() => setSelected(latest.id)}
                  >
                    View breakdown <ArrowUpRight size={17} />
                  </button>
                )}
              </section>
              {data.totals.map((total) => (
                <Panel
                  key={total.currency}
                  title={`${year} salary totals · ${total.currency}`}
                  description={`${total.count} released payslips, grouped by period end date`}
                >
                  <div className="emp-summary-grid">
                    <div>
                      <span>Gross earnings</span>
                      <strong>{money(total.gross, total.currency)}</strong>
                    </div>
                    <div>
                      <span>Deductions</span>
                      <strong>{money(total.deductions, total.currency)}</strong>
                    </div>
                    <div>
                      <span>Net salary</span>
                      <strong>{money(total.net, total.currency)}</strong>
                    </div>
                  </div>
                </Panel>
              ))}
              <Panel
                title="Payment accounts"
                description="Contact payroll to update your bank details."
                action={
                  <button
                    className="pp-text-button"
                    onClick={() => navigate("contracts")}
                  >
                    My contracts <ArrowUpRight size={16} />
                  </button>
                }
              >
                <div className="emp-panel-body">
                  {data.bankAccounts.length ? (
                    data.bankAccounts.map((account) => (
                      <div className="emp-bank-row" key={account.id}>
                        <CreditCard size={22} />
                        <div>
                          <strong>
                            {account.bankName} · •••• {account.accountLastFour}
                          </strong>
                          <p>
                            {account.accountHolderName} · {account.currency}
                          </p>
                        </div>
                        {account.isPrimary && <Badge value="PRIMARY" />}
                      </div>
                    ))
                  ) : (
                    <Empty title="No payment account on file">
                      Ask your payroll team to add your bank account.
                    </Empty>
                  )}
                </div>
              </Panel>
            </>
          )}
          {pendingSlips.length > 0 && (
            <Panel
              title="Payslips in progress"
              description="Your payroll team is preparing these statements. Salary details and PDF downloads become available after payroll validation."
            >
              <div className="pp-table-scroll">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Payslip</th>
                      <th>Period</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingSlips.map((slip) => (
                      <tr key={slip.id}>
                        <td>{slip.number}</td>
                        <td>
                          {dateLabel(slip.periodStart)} –{" "}
                          {dateLabel(slip.periodEnd)}
                        </td>
                        <td>
                          <span className="pp-badge pp-badge-neutral">
                            {slip.status === "COMPUTED"
                              ? "Awaiting payroll approval"
                              : "Being prepared"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          <Panel
            title={section === "payslips" ? "My payslips" : "Salary history"}
            description="Validated payslips and recorded payment status. Open a statement for its full breakdown."
          >
            {data.slips.length ? (
              <div className="pp-table-scroll">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Payslip</th>
                      <th>Period</th>
                      <th>Gross</th>
                      <th>Deductions</th>
                      <th>Net salary</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.slips.map((slip) => (
                      <tr key={slip.id}>
                        <td>
                          <button
                            className="pp-text-button"
                            onClick={() => setSelected(slip.id)}
                          >
                            <FileText size={16} />
                            {slip.number}
                          </button>
                        </td>
                        <td>
                          {dateLabel(slip.periodStart)}
                          <small>to {dateLabel(slip.periodEnd)}</small>
                        </td>
                        <td>{money(slip.grossAmount, slip.currency)}</td>
                        <td>{money(slip.deductionAmount, slip.currency)}</td>
                        <td>
                          <strong>
                            {money(slip.netAmount, slip.currency)}
                          </strong>
                        </td>
                        <td>
                          <Badge value={slip.status} />
                        </td>
                        <td>
                          <DownloadButton
                            kind="payslip"
                            id={slip.id}
                            fileName={`payslip-${slip.id}.pdf`}
                            label="PDF"
                            onError={setError}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title={`No released payslips for ${year}`}>
                {pendingSlips.length
                  ? "Your statements are listed above. Downloads will appear here once your payroll team validates them."
                  : "Choose another year or check with your payroll team."}
              </Empty>
            )}
          </Panel>
        </>
      )}
      {selected && (
        <PayslipDetails id={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
