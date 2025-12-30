import type { TemplateDefinition } from '../types';
import { renderBaseTemplate } from './base';

export interface OrderLineItem {
  item: string;
  price: string;
}

export interface OrderConfirmationTemplatePayload {
  name: string;
  orderNumber: string;
  items: OrderLineItem[];
  detailsUrl?: string;
}

export const orderConfirmationTemplate: TemplateDefinition<'order-confirmation', OrderConfirmationTemplatePayload> = {
  id: 'order-confirmation',
  render: ({ name, orderNumber, items, detailsUrl }) => {
    const safeName = name || 'there';
    const link = detailsUrl ?? 'https://insturix.com/dashboard/orders';

    const tableRows = items
      .map(item => `
        <tr>
          <td style="border-bottom:1px solid #e5e7eb;padding:10px 0;">${item.item}</td>
          <td style="border-bottom:1px solid #e5e7eb;padding:10px 0;text-align:right;">${item.price}</td>
        </tr>
      `)
      .join('');

    const body = `
      <h1 style="color:#111827;margin-bottom:20px;">Order confirmed</h1>
      <p>Hi ${safeName},</p>
      <p>Thank you for choosing Insturix. Your order ${orderNumber} is confirmed.</p>
      <table style="width:100%;margin:20px 0;">${tableRows}</table>
      <a class="button" href="${link}">View Order</a>
      <p>You will receive another email when your order status changes.</p>
      <p>Regards,<br/>The Insturix Team</p>
    `;

    const textLines = [
      'Order confirmed',
      '',
      `Hi ${safeName},`,
      `Thank you for choosing Insturix. Your order ${orderNumber} is confirmed.`,
      '',
      'Items:',
      ...items.map(item => `- ${item.item}: ${item.price}`),
      '',
      `View Order: ${link}`,
      '',
      'You will receive another email when your order status changes.',
      '',
      'Regards,',
      'The Insturix Team',
    ];

    return {
      subject: `Order confirmation ${orderNumber}`,
      html: renderBaseTemplate({ body, preheader: `Order ${orderNumber} has been confirmed.` }),
      text: textLines.join('\n'),
      preheader: `Order ${orderNumber} has been confirmed.`,
    };
  },
};
