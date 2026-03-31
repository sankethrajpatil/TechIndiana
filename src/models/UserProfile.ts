import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export interface IUserProfile extends Document {
  firebaseUid: string;
  email?: string;
  name?: string;
  background?: string;
  expectations?: string;
  study_plan?: string;
  conversation_summary?: string;
  conversation_history?: IMessage[];
}

const UserProfileSchema: Schema = new Schema({
  firebaseUid: { type: String, required: true, unique: true },
  email: { type: String, trim: true, lowercase: true },
  name: { type: String, trim: true, minlength: 1 },
  background: { type: String, trim: true, minlength: 1 },
  expectations: { type: String, trim: true, minlength: 1 },
  study_plan: { type: String },
  conversation_summary: { type: String },
  conversation_history: [{
    role: { type: String, enum: ['user', 'model'] },
    content: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
}, { timestamps: true });

export default mongoose.model<IUserProfile>('UserProfile', UserProfileSchema);
