import mongoose, { Document, Schema } from "mongoose";

enum UserType {
  Free = "Free",
  Pro = "Pro",
  Premium = "Premium",
  Ultra = "Ultra",
  Exclusive = "Exclusive",
}

interface IPayment {
  date: Date;
  time: string;
  amount: number;
  payment_id: string;
  phone_number: string;
}

interface IUser extends Document {
  clerkUserId: string;
  userType: UserType;
  payments: IPayment[];
  email: string;
}

const userSchema = new Schema<IUser>(
  {
    clerkUserId: {
      type: String,
      required: true,
      unique: true,
    },
    userType: {
      type: String,
      enum: Object.values(UserType),
      default: UserType.Free,
    },
    payments: [
      {
        date: {
          type: Date,
          required: true,
        },
        time: {
          type: String,
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        payment_id: {
          type: String,
          required: true,
        },
        phone_number: {
          type: String,
          required: true,
        },
      },
    ],
    email: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
export default User;
