import mongoose, { Document, Schema } from "mongoose";

interface IContactSales extends Document {
  name: string;
  email: string;
  companyName: string;
  phone?: string;
  companySize?: string;
  message: string;
  read?: boolean;
  readAt?: Date | null;
  deleted?: boolean;
  deletedAt?: Date | null;
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
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      required: false,
      default: null,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      required: false,
      default: null,
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

