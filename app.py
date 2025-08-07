from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for, flash
from rag_pipeline import load_docs, create_vector_store, ask_question, extract_key_points, Summarize_document
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT
from io import BytesIO
import os
import uuid
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from pymongo import MongoClient
from datetime import datetime

app = Flask(__name__)
app.secret_key = "your_secret_key"  # Use a strong secret key in production

# Database setup
MONGO_URI = "mongodb+srv://your_name:password@cluster0.uqpxkcl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
client = MongoClient(MONGO_URI)
db = client["legal_summarizer"]
collection = db["documents"]
users_collection = db["users"]
chats_collection = db["chats"]

UPLOAD_FOLDER = "uploads"
chat_history = []
vector_store = None
documents = []

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Allowed extensions and max size (10MB)
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt', 'csv', 'xlsx'}
MAX_FILE_SIZE_MB = 10
MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024


# === AUTH ROUTES ===

@app.route("/")
def home():
    if "email" in session:
        return render_template("index.html", email=session["email"])
    else:
        return redirect(url_for('login'))


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        name = request.form.get("name")
        email = request.form.get("email").lower()
        password = request.form.get("password")

        if not name or not email or not password:
            flash("All fields are required.")
            return render_template("signup.html")

        existing_user = users_collection.find_one({"email": email})
        if existing_user:
            return render_template("signup.html", email_exists=True)

        hashed_password = generate_password_hash(password)
        users_collection.insert_one({
            "name": name,
            "email": email,
            "password": hashed_password
        })
        flash("Account created successfully. Please log in.")
        return redirect(url_for('login'))

    return render_template("signup.html")


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username_or_email = request.form.get("username")
        password = request.form.get("password")

        user = users_collection.find_one({
            "$or": [{"email": username_or_email}, {"name": username_or_email}]
        })

        if not user:
            flash("User not found. Please register first.")
            return redirect(url_for("login"))

        if not check_password_hash(user["password"], password):
            flash("Incorrect password. Please try again.")
            return redirect(url_for("login"))

        session["email"] = user["email"]
        session["user_id"] = str(user["_id"])
        return redirect(url_for("home"))

    return render_template("login.html")



@app.route('/logout', methods=['POST'])
def logout():
    session.clear()  # ya session.pop('user', None)
    return redirect(url_for('login'))  # ya jahan bhi bhejna ho


# === MAIN APP ROUTE ===

@app.route('/')
def index():
    if "user_id" not in session:
        return redirect(url_for("login"))
    return render_template("index.html")


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload', methods=['POST'])
def upload():
    global documents, vector_store, chat_history

    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if not allowed_file(file.filename):
        return jsonify({'error': 'Unsupported file type.'}), 400

    file.seek(0, os.SEEK_END)
    if file.tell() > MAX_FILE_SIZE:
        return jsonify({'error': f'File too large. Max allowed size is {MAX_FILE_SIZE_MB}MB.'}), 400
    file.seek(0)

    filename = secure_filename(file.filename)
    session_id = str(uuid.uuid4())
    session_folder = os.path.join(UPLOAD_FOLDER, session_id)
    os.makedirs(session_folder, exist_ok=True)
    file_path = os.path.join(session_folder, filename)
    file.save(file_path)

    collection.insert_one({
        "filename": filename,
        "session_id": session_id,
        "upload_time": datetime.utcnow(),
        "user_id": session.get("user_id")
    })

    documents = []
    vector_store = None
    chat_history = []
    documents = load_docs(file_path)
    vector_store = create_vector_store(documents)
    # 👇 Add this inside upload() function before returning the response
    user_id = session.get("user_id")

    existing_chat = chats_collection.find_one({"user_id": user_id})
    if not existing_chat:
        chat_id = str(uuid.uuid4())
        new_chat = {
            "user_id": user_id,
            "chat_id": chat_id,
            "title": generate_default_title(),
            "messages": [],
            "created_at": datetime.utcnow()
        }
        chats_collection.insert_one(new_chat)


    return jsonify({'message': 'Document uploaded successfully.'})


@app.route('/extract', methods=['GET'])
def extract():
    if not documents:
        return "No document uploaded yet.", 400
    summary_points = extract_key_points(documents)
    collection.insert_one({
        "type": "extracted_clauses",
        "content": summary_points,
        "timestamp": datetime.utcnow(),
        "user_id": session.get("user_id")
    })
    return jsonify(summary_points)


@app.route('/summarize', methods=['GET'])
def summarize():
    if not documents:
        return "No document uploaded yet.", 400
    summary_points = Summarize_document(documents)
    collection.insert_one({
        "type": "summary",
        "content": summary_points,
        "timestamp": datetime.utcnow(),
        "user_id": session.get("user_id")
    })
    return jsonify(summary_points)


@app.route('/preview', methods=['GET'])
def preview_text():
    text = "\n\n".join([doc.page_content for doc in documents])
    return jsonify({"text": text})


pdfmetrics.registerFont(TTFont('DejaVu', 'fonts/DejaVuSans.ttf'))

@app.route('/download_pdf', methods=['POST'])
def download_pdf():
    data = request.get_json()
    points = data.get("points", [])
    buffer = BytesIO()

    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            rightMargin=40, leftMargin=40,
                            topMargin=40, bottomMargin=40)

    bullet_style = ParagraphStyle(
        name='BulletStyle',
        fontName='DejaVu',
        fontSize=11,
        leading=14,
        leftIndent=9,
        firstLineIndent=-9,
        spaceAfter=0,
        alignment=TA_LEFT
    )

    content = []
    for point in points:
        if point.strip():
            para = Paragraph(f'• {point}', bullet_style)
            content.append(para)
            content.append(Spacer(1, 8))

    doc.build(content)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True,
                     download_name="extracted_points.pdf",
                     mimetype='application/pdf')


@app.route('/download_summary_pdf', methods=['POST'])
def download_summary_pdf():
    data = request.get_json()
    points = data.get("points", [])
    buffer = BytesIO()

    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            rightMargin=40, leftMargin=40,
                            topMargin=40, bottomMargin=40)

    bullet_style = ParagraphStyle(
        name='BulletStyle',
        fontName='DejaVu',
        fontSize=11,
        leading=14,
        leftIndent=9,
        firstLineIndent=-9,
        spaceAfter=0,
        alignment=TA_LEFT
    )

    content = []
    for point in points:
        if point.strip():
            para = Paragraph(f'• {point}', bullet_style)
            content.append(para)
            content.append(Spacer(1, 8))

    doc.build(content)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True,
                     download_name="Summary.pdf",
                     mimetype='application/pdf')



@app.route('/chat/<chat_id>/rename', methods=['POST'])
def rename_chat(chat_id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    new_title = data.get("newTitle")
    if not new_title:
        return jsonify({"error": "No title provided"}), 400

    chats_collection.update_one(
        {"chat_id": chat_id, "user_id": session["user_id"]},
        {"$set": {"title": new_title}}
    )
    return jsonify({"success": True})

@app.route('/chat/<chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    result = chats_collection.delete_one({
        "chat_id": chat_id,
        "user_id": session["user_id"]
    })

    if result.deleted_count == 0:
        return jsonify({"error": "Chat not found"}), 404

    return jsonify({"success": True})

def generate_default_title():
    count = chats_collection.count_documents({"user_id": session["user_id"]})
    return f" Untitled Chat {count + 1}"

@app.route('/create_chat', methods=['POST'])
def create_chat():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    chat_id = str(uuid.uuid4())
    new_chat = {
        "user_id": session["user_id"],
        "chat_id": chat_id,
        "title": generate_default_title(),
        "messages": [],
        "created_at": datetime.utcnow()
    }
    chats_collection.insert_one(new_chat)
    return jsonify({"chat_id": chat_id, "title": new_chat["title"]})


@app.route('/get_chats', methods=['GET'])
def get_chats():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    chats = chats_collection.find({"user_id": session["user_id"]})
    chat_list = [{"chat_id": chat["chat_id"], "title": chat["title"]} for chat in chats]
    return jsonify(chat_list)

@app.route('/chat/<chat_id>/ask', methods=['POST'])
def chat_ask(chat_id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    question = request.form['question']
    if not vector_store:
        return jsonify({'answer': "Please upload a document first."})

    answer, sources = ask_question(vector_store, question)

    # Combine filter only by user_id and chat_id
    chat_filter = {
        "user_id": session["user_id"],
        "chat_id": chat_id
    }

    # Push user message
    chats_collection.update_one(
        chat_filter,
        {"$push": {"messages": {"role": "user", "text": question}}}
    )

    # Push bot response
    chats_collection.update_one(
        chat_filter,
        {"$push": {"messages": {"role": "bot", "text": answer}}}
    )

    return jsonify({'answer': answer})



@app.route('/chat/<chat_id>/history', methods=['GET'])
def chat_history(chat_id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    chat = chats_collection.find_one({"chat_id": chat_id, "user_id": session["user_id"]})
    if not chat:
        return jsonify({"error": "Chat not found"}), 404

    return jsonify(chat.get("messages", []))


if __name__ == '__main__':
    app.run(debug=True)
