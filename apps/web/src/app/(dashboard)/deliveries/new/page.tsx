import type { Metadata } from 'next';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import { ErrorState } from '@/components/ui';

export const metadata: Metadata={title:'Create Delivery'};

export default async function NewDeliveryPage({searchParams}:{searchParams:Promise<{customerId?:string}>}){
  const params=await searchParams;
  const user=await getCurrentUser();
  if(!user?.permissions.includes('delivery.create')) return <ErrorState title="Not allowed" message="You do not have permission to create deliveries."/>;
  let customers:any[]=[]; let invoices:any[]=[];
  try{
    const customerData=await apiFetch<any>(`/customers?page=1&pageSize=100`);
    customers=customerData.items??[];
    if(params.customerId) invoices=await apiFetch<any[]>(`/deliveries/eligible-invoices?customerId=${params.customerId}`);
  }catch(error){ return <ErrorState title="Could not load delivery form" message={error instanceof Error?error.message:'The server could not be reached.'}/>;}

  async function createDelivery(formData:FormData){
    'use server';
    const items=String(formData.get('items')??'').split(';').map((entry)=>entry.trim()).filter(Boolean).map((entry)=>{const [invoiceItemId,quantity]=entry.split(':');return {invoiceItemId,quantity:Number(quantity)}}).filter((i)=>i.invoiceItemId&&i.quantity>0);
    const customerId=String(formData.get('customerId'));
    const finalInvoiceId=String(formData.get('finalInvoiceId'));
    const delivery=await apiFetch<any>('/deliveries',{method:'POST',body:{
      customerId,finalInvoiceId,
      deliveryDate:String(formData.get('deliveryDate')),
      expectedDate:String(formData.get('expectedDate')||'')||undefined,
      deliveryAddress:String(formData.get('deliveryAddress')),
      contactPerson:String(formData.get('contactPerson')||'')||null,
      contactNumber:String(formData.get('contactNumber')||'')||null,
      internalRemarks:String(formData.get('internalRemarks')||'')||null,
      items,
    }});
    revalidatePath('/deliveries');
    redirect(`/deliveries/${delivery.id}`);
  }

  return <div className="space-y-5"><div><h1 className="text-xl font-bold text-ink">Create Delivery</h1><p className="text-sm text-ink-muted">Select an issued final invoice and enter current dispatch quantities.</p></div>
    <form className="card space-y-4 p-5" method="get"><label className="block text-sm font-medium">Customer<select name="customerId" defaultValue={params.customerId??''} className="form-input mt-1 w-full" required><option value="">Select customer</option>{customers.map((c:any)=><option key={c.id} value={c.id}>{c.name} — {c.customerCode}</option>)}</select></label><button className="btn-secondary" type="submit">Load eligible invoices</button></form>
    {params.customerId&&<form action={createDelivery} className="card space-y-4 p-5">
      <input type="hidden" name="customerId" value={params.customerId}/>
      <label className="block text-sm font-medium">Final Invoice<select name="finalInvoiceId" className="form-input mt-1 w-full" required><option value="">Select invoice</option>{invoices.map((i:any)=><option key={i.id} value={i.id}>{i.invoiceNumber} — {i.remainingQuantity} remaining</option>)}</select></label>
      <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Delivery Date<input name="deliveryDate" type="date" className="form-input mt-1 w-full" required/></label><label className="text-sm font-medium">Expected Delivery Date<input name="expectedDate" type="date" className="form-input mt-1 w-full"/></label></div>
      <label className="block text-sm font-medium">Delivery Address<textarea name="deliveryAddress" className="form-input mt-1 w-full" rows={3} required/></label>
      <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Contact Person<input name="contactPerson" className="form-input mt-1 w-full"/></label><label className="text-sm font-medium">Contact Number<input name="contactNumber" className="form-input mt-1 w-full"/></label></div>
      <label className="block text-sm font-medium">Internal Remarks<textarea name="internalRemarks" className="form-input mt-1 w-full" rows={2}/></label>
      <label className="block text-sm font-medium">Delivery Items <span className="font-normal text-ink-muted">(format: invoiceItemId:quantity;invoiceItemId:quantity)</span><textarea name="items" className="form-input mt-1 w-full" rows={4} required/></label>
      <div className="flex gap-3"><button className="btn-primary" type="submit">Create Delivery</button><Link className="btn-secondary" href="/deliveries">Cancel</Link></div>
    </form>}
  </div>;
}
