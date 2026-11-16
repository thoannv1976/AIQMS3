import { requireUser } from "@/lib/auth";
import { roleLabel } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { DescItem } from "@/components/widgets";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div>
      <PageHeader title="Tài khoản của tôi" description="Thông tin đăng nhập và đổi mật khẩu" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-slate-100">
              <DescItem label="Họ tên">{user.fullName}</DescItem>
              <DescItem label="Email">{user.email}</DescItem>
              <DescItem label="Vai trò">{roleLabel(user.role)}</DescItem>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Đổi mật khẩu</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
