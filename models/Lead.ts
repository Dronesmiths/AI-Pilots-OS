import mongoose, { Schema, Document } from 'mongoose';

export interface ILead extends Document {
  vapiCallId: string;
  crmStatus: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema: Schema = new Schema(
  {
    vapiCallId: {
      type: String,
      required: true,
      unique: true,
    },
    crmStatus: {
      type: String,
      enum: ['New', 'Contacted', 'Closed'],
      default: 'New',
    },
    notes: {
      type: String,
      required: false,
    }
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Lead || mongoose.model<ILead>('Lead', LeadSchema);
