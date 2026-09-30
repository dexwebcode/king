import { Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "./AdminLayout";
import Dashboard from "./Dashboard";
import OrdersAdmin from "./OrdersAdmin";
import OrderDetail from "./OrderDetail";
import UsersAdmin from "./UsersAdmin";
import UserDetail from "./UserDetail";
import ReviewsAdmin from "./ReviewsAdmin";
import AdminSupport from "./AdminSupport";
import FinanceAdmin from "./FinanceAdmin";
import AnalyticsAdmin from "./AnalyticsAdmin";
import MarkupAdmin from "./MarkupAdmin";
import AuditLogAdmin from "./AuditLogAdmin";

/* Единая точка входа админ-панели: /admin/*
   Права проверяются на backend для КАЖДОГО запроса (зависимость get_current_admin),
   здесь — только каркас интерфейса и навигация. */
export default function AdminApp() {
    return (
        <AdminLayout>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders" element={<OrdersAdmin />} />
                <Route path="/orders/:orderId" element={<OrderDetail />} />
                <Route path="/users" element={<UsersAdmin />} />
                <Route path="/users/:userId" element={<UserDetail />} />
                <Route path="/reviews" element={<ReviewsAdmin />} />
                <Route path="/support" element={<AdminSupport />} />
                <Route path="/finance" element={<FinanceAdmin />} />
                <Route path="/analytics" element={<AnalyticsAdmin />} />
                <Route path="/markup" element={<MarkupAdmin />} />
                <Route path="/audit-log" element={<AuditLogAdmin />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
        </AdminLayout>
    );
}
