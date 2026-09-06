"use client";
import { useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { employeeApi } from "@/services/employee.service";
import { errorMessage } from "@/services/admin.service";
import {
  Dialog,
  DownloadButton,
  Empty,
  Panel,
  ResourceState,
  dateLabel,
  human,
  number,
  useEmployeeResource,
} from "./shared";

const categories = ["IDENTITY", "EDUCATION", "EMPLOYMENT", "TAX", "OTHER"];
function UploadForm({ onClose, saved }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      file = form.get("file");
    if (!file?.size || file.size > 5 * 1024 * 1024) {
      setError("Choose a non-empty PDF, PNG or JPEG file up to 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await employeeApi.uploadDocument(file, {
        title: form.get("title"),
        category: form.get("category"),
      });
      saved("Your document was uploaded.");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Upload a document" busy={busy} onClose={onClose}>
      <form className="pp-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Document title
            <input
              name="title"
              required
              maxLength={150}
              placeholder="e.g. Education certificate"
            />
          </label>
          <label>
            Category
            <select name="category">
              {categories.map((category) => (
                <option key={category} value={category}>
                  {human(category)}
                </option>
              ))}
            </select>
          </label>
          <label>
            File
            <input
              type="file"
              name="file"
              required
              accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
            />
          </label>
          <p className="pp-field-note">
            PDF, PNG or JPEG · maximum 5 MB per file. Your files are private to
            your employee account.
          </p>
        </fieldset>
        {error && (
          <div className="pp-error" role="alert">
            {error}
          </div>
        )}
        <div className="pp-dialog-actions">
          <button
            type="button"
            className="pp-button pp-button-outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="pp-button pp-button-primary" disabled={busy}>
            {busy ? "Uploading…" : "Upload document"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export default function EmployeeDocuments({
  revision,
  refresh,
  saved,
  navigate,
}) {
  const resource = useEmployeeResource(employeeApi.documents, {}, revision);
  const [category, setCategory] = useState(""),
    [search, setSearch] = useState(""),
    [dialog, setDialog] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const done = (message) => {
    setDialog(null);
    saved(message);
  };
  const data = resource.data,
    rows = data?.filter(
      (d) =>
        (!category || d.category === category) &&
        `${d.title} ${d.fileName}`.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <Panel
      title="My documents"
      description={
        data
          ? `${data.length} of 100 files · ${number(data.reduce((n, d) => n + d.byteSize, 0) / 1048576)} of 50 MB used`
          : "Keep your personal employment files in one place."
      }
      action={
        <button
          className="pp-button pp-button-primary"
          onClick={() => setDialog({ type: "upload" })}
        >
          <Plus size={17} />
          Upload document
        </button>
      }
    >
      <div className="emp-toolbar pp-form">
        <label className="emp-grow">
          <span className="emp-sr-only">Search documents</span>
          <input
            value={search}
            maxLength={150}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
          />
        </label>
        <label>
          <span className="emp-sr-only">Document category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {human(c)}
              </option>
            ))}
          </select>
        </label>
        <button className="pp-text-button" onClick={() => navigate("payslips")}>
          View payslips
        </button>
      </div>
      {error && (
        <div className="pp-error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <ResourceState resource={resource} onRetry={refresh} />
      ) : rows.length ? (
        <div className="pp-table-scroll">
          <table className="pp-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Category</th>
                <th>Uploaded</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((document) => (
                <tr key={document.id}>
                  <td>
                    <div className="emp-file-title">
                      <FileText size={20} />
                      <div>
                        <strong>{document.title}</strong>
                        <small>{document.fileName}</small>
                      </div>
                    </div>
                  </td>
                  <td>{human(document.category)}</td>
                  <td>{dateLabel(document.createdAt)}</td>
                  <td>{number(document.byteSize / 1024)} KB</td>
                  <td>
                    <div className="emp-row-actions">
                      <DownloadButton
                        kind="document"
                        id={document.id}
                        fileName={document.fileName}
                        onError={setError}
                      />
                      <button
                        className="pp-icon-button"
                        aria-label={`Delete ${document.title}`}
                        onClick={() => {
                          setError("");
                          setDialog({ type: "delete", document });
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={
            data.length
              ? "No matching documents"
              : "Your document library is empty"
          }
        >
          Upload an identity document, certificate or other employment record.
        </Empty>
      )}
      {dialog?.type === "upload" && (
        <UploadForm onClose={() => setDialog(null)} saved={done} />
      )}
      {dialog?.type === "delete" && (
        <Dialog
          title="Delete document"
          onClose={() => setDialog(null)}
          busy={busy}
        >
          <div className="emp-dialog-content">
            <p>
              Delete “{dialog.document.title}”? Download a copy first if you
              need to keep it.
            </p>
            {error && (
              <div className="pp-error" role="alert">
                {error}
              </div>
            )}
            <div className="pp-dialog-actions">
              <button
                className="pp-button pp-button-outline"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Keep document
              </button>
              <button
                className="pp-button pp-button-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await employeeApi.deleteDocument(dialog.document.id);
                    done("Document deleted.");
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Deleting…" : "Delete document"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </Panel>
  );
}
