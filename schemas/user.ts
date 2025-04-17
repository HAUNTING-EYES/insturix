import mongoose, { Document, Schema } from "mongoose";
import { UserType } from "@/types/userTypes";

interface IPayment {
  date: Date;
  time: string;
  amount: number;
  payment_id: string;
  phone_number: string;
}

export interface IPlan {
  _id?: mongoose.Types.ObjectId;
  name: UserType;
  startDate: Date;
  endDate: Date | null;
  price: number;
  status: "active" | "expired" | "canceled";
  features?: string[];
}

interface IUser extends Document {
  clerkUserId: string;
  userType: UserType;
  payments: IPayment[];
  email: string;
  signUpDate: Date;
  planHistory: IPlan[];
  currentPlan: IPlan;
}

const planSchema = new Schema<IPlan>(
  {
    name: {
      type: String,
      enum: Object.values(UserType),
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null,
    },
    price: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "expired", "canceled"],
      required: true,
    },
    features: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

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
    signUpDate: {
      type: Date,
      default: Date.now,
    },
    planHistory: {
      type: [planSchema],
      default: [],
    },
    currentPlan: {
      type: planSchema,
      required: true,
      default: () => {
        const now = new Date();
        const oneMonthLater = new Date(now);
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        return {
          name: UserType.Free,
      startDate: new Date(now.toISOString()),
      endDate: new Date(oneMonthLater.toISOString()),
          price: 0,
          status: "active",
          features: ["Basic access", "Limited storage", "Community support"],
        };
      },
    }
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware
userSchema.pre("save", function (next) {
  if (this.isNew || this.isModified("currentPlan")) {
    const currentStart = this.currentPlan?.startDate?.getTime?.();
    const planExists = this.planHistory.some((plan) => {
      return (
        plan.name === this.currentPlan.name &&
        plan.startDate?.getTime?.() === currentStart &&
        plan.price === this.currentPlan.price
      );
    });

    if (!planExists) {
      this.planHistory.push(this.currentPlan);
    }
  }

  next();
});

const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
export default User;