// ປະເພດບັນທຶກທີ່ຖານຂໍ້ມູນອະນຸຍາດ (ຕ້ອງກົງກັບ class_notes_kind_check)
export type NoteKind = "cancel" | "homework" | "note";

export interface ParsedNote {
  kind: NoteKind;
  content: string;
}

// ຄຳທີ່ໝາຍເຖິງການຢຸດຮຽນ ໃຊ້ \b ເພື່ອຈັບທັງຄຳເທົ່ານັ້ນ
const CANCEL_PATTERN = /\b(no class|cancel(?:l?ed)?|skip|absent|day off|off today|rest today)\b/i;

// ຄຳທີ່ໝາຍເຖິງການບ້ານ
const HOMEWORK_PATTERN = /\b(homework|assignment|hw)\b/i;

// ແປງຂໍ້ຄວາມເປັນ kind; ຖ້າຂໍ້ຄວາມຫວ່າງ ໃຫ້ສົ່ງ null
export function parseNote(text: string): ParsedNote | null {
  const content = text.trim();
  if (content === "") return null;
  // ກວດ cancel ກ່ອນ ເພາະມີຜົນຕໍ່ການແຈ້ງເຕືອນຫຼາຍກວ່າ
  if (CANCEL_PATTERN.test(content)) return { kind: "cancel", content };
  if (HOMEWORK_PATTERN.test(content)) return { kind: "homework", content };
  return { kind: "note", content };
}