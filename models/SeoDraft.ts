import mongoose, { Schema, Document } from 'mongoose';

export interface ISeoDraft extends Document {
  clientId: string;           // Maps directly to the User _id
  targetDomain: string;       // e.g. "aipilots.site"
  topicCategory: string;      // Specific Cluster/Topic logic
  targetKeyword: string;      // The exact keyword we targeted
  pageTitle: string;          // The generated H1 title
  contentMarkdown: string;    // The raw, physical Markdown structural generation
  targetUrlSlug: string;      // e.g. "/services/ai-voice-agent"
  status: 'Draft' | 'Approved'; // State machine to prevent unauthorized leaks
  createdAt: Date;
  updatedAt: Date;
}

const SeoDraftSchema: Schema = new Schema(
  {
    clientId: {
      type: String,
      required: true,
      index: true,
    },
    targetDomain: {
      type: String,
      required: true,
      index: true,
    },
    topicCategory: {
      type: String,
      required: true,
    },
    targetKeyword: {
      type: String,
      required: true,
    },
    pageTitle: {
      type: String,
      required: true,
    },
    contentMarkdown: {
      type: String,
      required: true,
    },
    targetUrlSlug: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Draft', 'Approved'],
      default: 'Draft',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent Next.js from aggressively overriding the model cache upon local hot reloads
export default mongoose.models.SeoDraft || mongoose.model<ISeoDraft>('SeoDraft', SeoDraftSchema);
