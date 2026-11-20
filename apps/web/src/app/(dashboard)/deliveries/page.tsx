import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import { EmptyState, ErrorState, StatCard, Pagination } from '@/components/ui';
import { IconTruck } from '@/components/icons';
import { formatDate } from '@/lib/vendor-labels';

export const metadata: Metadata={title:'Delivery Management'};

export default async function DeliveriesPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const params=await searchParams;
  const user=await getCurrentUser();
  const can=(p:string)=>user?.permissions.includes(p)??false;
  if(!can('delivery.read')) return <ErrorState title="Not allowed" message="You do not have permission to view deliveries."/>;
  let data:any,summary:any;
  try{
    [data,summary]=await Promise.all([
      apiFetch<any>(`/deliveries${queryString({search:params.search,status:params.status,sortBy:params.sortBy??'createdAt',sortDir:params.sortDir??'desc',page:params.page??'1',pageSize:'10'})}`),
      apiFetch<any>('/deliveries/summary').catch(()=>null),
    ]);
  }catch(error){
    const apiError=error instanceof ApiError?error:null;
    return <ErrorState title="Could not load deliveries" message={apiError?.messages[0]??'The server could not be reached.'}/>;
  }
  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-ink">Delivery Management</h1><p className="text-sm text-ink-muted">Plan, dispatch and confirm customer deliveries.</p></div>{can('delivery.create')&&<Link className="btn-primary" href="/deliveries/new">Create Delivery</Link>}</div>
    {summary&&<section className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <StatCard label="Total Deliveries" value={summary.total} icon={<IconTruck size={22}/>} iconClassName="bg-accent" href="/deliveries"/>
      <StatCard label="Scheduled" value={summary.scheduled} icon={<IconTruck size={22}/>} iconClassName="bg-orange-500" href="/deliveries?status=SCHEDULED"/>
      <StatCard label="Ready for Dispatch" value={summary.readyForDispatch} icon={<IconTruck size={22}/>} iconClassName="bg-blue-500" href="/deliveries?status=READY_FOR_DISPATCH"/>
      <StatCard label="In Transit" value={summary.inTransit} icon={<IconTruck size={22}/>} iconClassName="bg-cyan-500" href="/deliveries?status=DISPATCHED,IN_TRANSIT"/>
      <StatCard label="Delivered" value={summary.delivered} icon={<IconTruck size={22}/>} iconClassName="bg-success" href="/deliveries?status=DELIVERED"/>
      <StatCard label="Delayed" value={summary.delayed} icon={<IconTruck size={22}/>} iconClassName="bg-danger" href="/deliveries"/>
      <StatCard label="Partially Delivered" value={summary.partiallyDelivered} icon={<IconTruck size={22}/>} iconClassName="bg-purple-500" href="/deliveries?status=PARTIALLY_DELIVERED"/>
      <StatCard label="Cancelled" value={summary.cancelled} icon={<IconTruck size={22}/>} iconClassName="bg-slate-500" href="/deliveries?status=CANCELLED"/>
    </section>}
    <form className="card flex flex-wrap items-end gap-3 p-4">
      <label className="flex-1 min-w-56 text-sm">Search<input name="search" defaultValue={params.search} className="form-input mt-1 w-full" placeholder="Delivery, invoice, customer or tracking"/></label>
      <label className="text-sm">Status<select name="status" defaultValue={params.status??''} className="form-input mt-1"><option value="">All</option>{['DRAFT','SCHEDULED','READY_FOR_DISPATCH','DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED','DELIVERED','DELIVERY_FAILED','RETURNED','CANCELLED'].map(s=><option key={s}>{s}</option>)}</select></label>
      <button className="btn-secondary" type="submit">Filter</button>
    </form>
    <div className="card overflow-hidden">{data.items.length===0?<EmptyState title="No deliveries" description="Create a delivery from an issued final invoice."/>:<div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Delivery</th><th>Invoice</th><th>Customer</th><th>Delivery Date</th><th>Status</th><th>Tracking</th></tr></thead><tbody>{data.items.map((d:any)=><tr key={d.id}><td><Link className="font-semibold text-accent" href={`/deliveries/${d.id}`}>{d.deliveryNumber}</Link></td><td>{d.finalInvoice?.invoiceNumber??'—'}</td><td>{d.customer?.name??'—'}</td><td>{d.deliveryDate?formatDate(d.deliveryDate):''}</td><td>{d.status}</td><td>{d.trackingNumber??'—'}</td></tr>)}</tbody></table></div>}</div>
    <Pagination meta={data.meta} basePath="/deliveries" params={{search:params.search,status:params.status}}/>
  </div>;
}
