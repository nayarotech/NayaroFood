import { fetchAdmin } from '@/lib/dashboard-api';
import { PageHeader } from '@/components/admin/page-header';
import { SiteTabs } from '@/components/admin/site/site-tabs';

export default async function SiteContentLayout({ children }: LayoutProps<'/admin/site'>) {
  const content = await fetchAdmin<{ unreadMessages: number }>('/admin/site/content');
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Site content"
        description="Edit the public website — homepage, header and footer, pages like About and Privacy, and messages from the contact form. Changes go live as soon as you publish."
      />
      <SiteTabs unread={content?.unreadMessages ?? 0} />
      {children}
    </div>
  );
}
