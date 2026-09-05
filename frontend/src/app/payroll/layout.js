import "../admin/admin.css";
import "../admin/theme.css";
import "../admin/workspace-interactions.css";
import ThemeProvider from "@/components/admin/theme-provider";
export const metadata = { title: "Payroll workspace · PeoplePay360" };
export default function PayrollLayout({ children }) { return <ThemeProvider>{children}</ThemeProvider>; }
