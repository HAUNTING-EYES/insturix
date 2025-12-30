import mongoose, { Document, Schema } from "mongoose";

interface IContactSales extends Document {
  name: string;
  email: string;
  companyName: string;
  phone?: string;
  companySize?: string;
  message: string;
}

const contactSalesSchema = new Schema<IContactSales>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    companyName: {
      type: String,
      required: true,
      maxlength: 40,
    },
    phone: {
      type: String,
      required: false,
    },
    companySize: {
      type: String,
      required: false,
    },
    message: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'agencies', // Store in 'agencies' collection
  }
);

const ContactSales =
  mongoose.models.ContactSales || mongoose.model<IContactSales>("ContactSales", contactSalesSchema);
export default ContactSales;

