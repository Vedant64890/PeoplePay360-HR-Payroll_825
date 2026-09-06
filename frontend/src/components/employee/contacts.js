"use client";
import { useState } from "react";
import { Mail, MapPin, Phone, Search } from "lucide-react";
import { employeeApi } from "@/services/employee.service";
import { Empty, Panel, ResourceState, useEmployeeResource } from "./shared";

export default function EmployeeContacts({ revision, refresh }) {
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [departmentId, setDepartment] = useState(""),
    [page, setPage] = useState(1);
  const resource = useEmployeeResource(
    employeeApi.contacts,
    { q: search, page, ...(departmentId ? { departmentId } : {}) },
    revision,
  );
  const data = resource.data;
  return (
    <Panel
      title="My contacts"
      description="Find colleagues by name, work email, department or position."
    >
      <form
        className="emp-toolbar pp-form"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <label className="emp-search">
          <span className="emp-sr-only">Search colleagues</span>
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your team…"
            maxLength={100}
          />
        </label>
        <label>
          <span className="emp-sr-only">Department</span>
          <select
            value={departmentId}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All departments</option>
            {data?.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <button className="pp-button pp-button-primary">Search</button>
      </form>
      {!data ? (
        <ResourceState resource={resource} onRetry={refresh} />
      ) : (
        <>
          <div className="emp-contact-grid">
            {data.items.map((person) => (
              <article className="emp-contact-card" key={person.id}>
                <div className="emp-person">
                  <span className="pp-avatar">
                    {person.firstName[0]}
                    {person.lastName?.[0]}
                  </span>
                  <div>
                    <h3>
                      {person.firstName} {person.lastName}
                      {person.id === data.ownId && <small> (you)</small>}
                    </h3>
                    <p>{person.jobPosition?.title || "Team member"}</p>
                  </div>
                </div>
                <span className="pp-badge pp-badge-neutral">
                  {person.department?.name || "Department unassigned"}
                </span>
                <div className="emp-contact-links">
                  {person.workEmail && (
                    <a href={`mailto:${person.workEmail}`}>
                      <Mail size={16} />
                      {person.workEmail}
                    </a>
                  )}
                  {person.workPhone && (
                    <a href={`tel:${person.workPhone}`}>
                      <Phone size={16} />
                      {person.workPhone}
                    </a>
                  )}
                  {person.workLocation && (
                    <span>
                      <MapPin size={16} />
                      {person.workLocation}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!data.items.length && (
            <Empty title="No colleagues found">
              Try another name or department.
            </Empty>
          )}
          <div className="emp-pagination">
            <span>
              {data.total} contacts · Page {page} of{" "}
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <div>
              <button
                className="pp-button pp-button-outline"
                disabled={page === 1}
                onClick={() => setPage((v) => v - 1)}
              >
                Previous
              </button>
              <button
                className="pp-button pp-button-outline"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage((v) => v + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
