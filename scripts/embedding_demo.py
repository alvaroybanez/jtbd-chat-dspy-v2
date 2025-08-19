"""
Demonstration of the embedding system integration.
Shows how all components work together end-to-end.
"""

import asyncio
from app.core import db
from app.core.llm_wrapper import initialize_llm
from app.core.embeddings import initialize_embedding_manager
from app.utils.text_utils import get_text_processor


def main():
    """Demonstrate the complete embedding workflow."""
    print("🚀 JTBD Assistant Platform - Embedding System Demo")
    print("=" * 60)

    # Step 1: Test database connection
    print("\n1. Testing database connection...")
    db_test = db.test_connection()
    if db_test["success"]:
        print("✅ Database connection successful")
        print(f"   Tables available: {list(db_test['tables'].keys())}")
    else:
        print(f"❌ Database connection failed: {db_test['error']}")
        return

    # Step 2: Initialize LLM wrapper
    print("\n2. Initializing LLM wrapper...")
    try:
        llm = initialize_llm(db)
        print("✅ LLM wrapper initialized")
    except Exception as e:
        print(f"❌ LLM initialization failed: {e}")
        return

    # Step 3: Initialize embedding manager
    print("\n3. Initializing embedding manager...")
    embedding_manager = initialize_embedding_manager(llm, db)
    print("✅ Embedding manager initialized")

    # Step 4: Initialize text processor
    print("\n4. Initializing text processor...")
    text_processor = get_text_processor()
    print("✅ Text processor initialized")

    # Step 5: Demonstrate text processing
    print("\n5. Demonstrating text processing...")
    sample_text = """
    When I'm trying to understand my customers' needs, I want to quickly extract 
    insights from their feedback, so that I can make data-driven product decisions. 
    This is especially important when dealing with large volumes of customer data 
    from surveys, interviews, and support tickets.
    """

    # Clean and chunk text
    cleaned_text = text_processor.clean_text(sample_text)
    token_count = text_processor.count_tokens(cleaned_text)
    chunks = text_processor.chunk_text_by_tokens(cleaned_text, chunk_size=50)

    print(f"   Original text length: {len(sample_text)} characters")
    print(f"   Cleaned text length: {len(cleaned_text)} characters")
    print(f"   Token count: {token_count}")
    print(f"   Number of chunks: {len(chunks)}")

    # Step 6: Demonstrate embedding generation (simulation)
    print("\n6. Simulating embedding generation...")

    # Mock embedding result for demo (real would call OpenAI)
    print("   📝 Note: This would generate real embeddings with OpenAI API")
    print("   📝 Example workflow:")
    print("      - Generate embedding for cleaned text")
    print("      - Cache embedding for reuse")
    print("      - Store in database with vector index")
    print("      - Enable semantic search across content")

    # Step 7: Demonstrate database operations (simulation)
    print("\n7. Simulating database operations...")
    print("   📝 Example operations:")
    print("      - Store document with embedding")
    print("      - Chunk and embed document content")
    print("      - Store insights with embeddings")
    print("      - Store JTBDs with embeddings")
    print("      - Perform vector similarity search")

    # Step 8: Show cache stats
    print("\n8. Cache statistics...")
    cache_stats = embedding_manager.get_cache_stats()
    print(f"   Cache size: {cache_stats['cache_size']} embeddings")
    print(f"   Embedding dimension: {cache_stats['cache_dimension']}")

    print("\n" + "=" * 60)
    print("✅ Embedding system integration demo completed!")
    print("\nNext steps:")
    print("1. Set up your .env file with OPENAI_API_KEY")
    print("2. Apply database migrations")
    print("3. Run the test suite: python -m pytest test_embeddings.py")
    print("4. Start using the embedding system in your Streamlit app")

    print("\nExample usage in your app:")
    print(
        """
    # Initialize system
    llm = initialize_llm(db)
    em = initialize_embedding_manager(llm, db)
    
    # Process and embed a document
    chunks = text_processor.chunk_document(content, title)
    result = em.embed_document_chunks(doc_id, chunks)
    
    # Semantic search
    query_result = llm.generate_embeddings("customer satisfaction")
    search_result = db.search_similar_chunks(query_result["embedding"])
    """
    )


if __name__ == "__main__":
    main()
