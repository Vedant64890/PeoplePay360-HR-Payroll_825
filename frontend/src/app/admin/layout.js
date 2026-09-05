import "./admin.css";
import "./theme.css";
import "./workspace-interactions.css";
import ThemeProvider from "@/components/admin/theme-provider";

export const metadata = { title: { default: "Admin workspace · PeoplePay360", template: "%s · PeoplePay360" }, description: "Your people, payroll and workplace in one connected admin workspace." };

export default function AdminLayout({ children }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
