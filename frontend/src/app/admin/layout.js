import "./admin.css";
import "./theme.css";
import "./workspace-interactions.css";
import ThemeProvider from "@/components/admin/theme-provider";

export const metadata = { title: { default: "Admin workspace · PeoplePay360", template: "%s · PeoplePay360" }, description: "Your people, payroll and workplace in one connected admin workspace." };

export default function AdminLayout({ children }) {
  return <><script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=localStorage.getItem('peoplepay360-theme');document.documentElement.dataset.ppTheme=(p==='light'||p==='dark')?p:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){document.documentElement.dataset.ppTheme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})();` }} /><ThemeProvider>{children}</ThemeProvider></>;
}
