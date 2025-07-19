import os
import uuid
import gc
from langchain_community.embeddings.openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain.text_splitter import CharacterTextSplitter
from langchain_community.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA
from langchain.schema import Document
import pandas as pd

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
active_vectorstore = None
vectorstore_path = None

def load_docs(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        loader = PyPDFLoader(path)
        return loader.load()
    elif ext == ".txt":
        loader = TextLoader(path)
        return loader.load()
    elif ext == ".docx":
        loader = Docx2txtLoader(path)
        return loader.load()
    elif ext == ".csv":
        df = pd.read_csv(path)
        text = df.to_string(index=False)
        return [Document(page_content=text)]
    elif ext == ".xlsx":
        df = pd.read_excel(path)
        text = df.to_string(index=False)
        return [Document(page_content=text)]
    else:
        raise ValueError(f"Unsupported file format: {ext}")

def create_vector_store(docs):
    global active_vectorstore, vectorstore_path

    # Step 1: Cleanup
    active_vectorstore = None
    gc.collect()

    # Step 2: Generate a unique vectorstore folder
    vectorstore_path = os.path.join("db", str(uuid.uuid4()))
    os.makedirs(vectorstore_path, exist_ok=True)

    # Step 3: Create vectorstore in that folder
    embeddings = OpenAIEmbeddings(openai_api_key=OPENAI_API_KEY)
    vectordb = Chroma.from_documents(
        documents=docs,
        embedding=embeddings,
        persist_directory=vectorstore_path
    )
    vectordb.persist()

    active_vectorstore = vectordb
    return vectordb

def ask_question(vector_store, question):
    llm = ChatOpenAI(openai_api_key=OPENAI_API_KEY)
    retriever = vector_store.as_retriever()
    qa_chain = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)
    return qa_chain.run(question)

def extract_key_points(docs):
    llm = ChatOpenAI(openai_api_key=OPENAI_API_KEY)
    splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_documents(docs)
    points = []

    for i, chunk in enumerate(chunks):
        prompt = f"""
You are a legal assistant. If the following is a legal contract, extract all important clauses, terms, dates, obligations, and rights as bullet points.
If it's a general document, summarize the key points.

Text chunk {i+1}:
\"\"\"{chunk.page_content}\"\"\"
"""
        try:
            response = llm.invoke(prompt)  # FIX: use invoke not predict
            lines = response.content.split("\n") if hasattr(response, "content") else response.split("\n")
            for line in lines:
                clean = line.strip("-\u2022 \n")
                if clean:
                    points.append("\u2022 " + clean)
        except Exception as e:
            points.append(f"[Error extracting from chunk {i+1}]")

    return points
