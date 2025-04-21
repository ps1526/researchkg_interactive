import os
import json
from functools import wraps
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore, auth
from flask import request, jsonify
from dotenv import load_dotenv
import traceback

load_dotenv()

# Initialize Firebase Admin SDK
def initialize_firebase():
    """Initialize Firebase Admin SDK with credentials from environment variables"""
    try:
        # Check if Firebase is already initialized
        if not firebase_admin._apps:
            # For local development, use a service account key file
            if os.environ.get('FIREBASE_SERVICE_ACCOUNT'):
                # Check if it's a JSON string or a path
                firebase_creds = os.environ.get('FIREBASE_SERVICE_ACCOUNT')
                try:
                    # Try to parse as JSON string
                    cred_dict = json.loads(firebase_creds)
                    cred = credentials.Certificate(cred_dict)
                    print("Initialized Firebase with credentials from environment variable")
                except json.JSONDecodeError:
                    # Use as a path
                    cred = credentials.Certificate(firebase_creds)
                    print("Initialized Firebase with credentials from file path in environment variable")
                firebase_admin.initialize_app(cred)
            elif os.path.exists('firebase-credentials.json'):
                # Look for credentials file in the current directory
                cred = credentials.Certificate('firebase-credentials.json')
                firebase_admin.initialize_app(cred)
                print("Initialized Firebase with credentials from local file")
            # For Cloud Run, use the default credentials
            else:
                firebase_admin.initialize_app()
                print("Initialized Firebase with default credentials")
                
            print("Firebase Admin SDK initialized successfully")
        return True
    except Exception as e:
        print(f"Error initializing Firebase: {str(e)}")
        traceback.print_exc()
        return False

# Initialize Firebase on module import
firebase_initialized = initialize_firebase()

def get_firestore_db():
    """Get a Firestore client instance"""
    if not firebase_initialized:
        initialize_firebase()
    return firestore.client()

# Authentication decorator for API routes
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get the ID token from the Authorization header
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({"error": "Unauthorized: No token provided"}), 401
        
        token = auth_header.split('Bearer ')[1]
        
        try:
            # Verify the token
            decoded_token = auth.verify_id_token(token)
            # Add the user to the request
            request.user = decoded_token
            return f(*args, **kwargs)
        except Exception as e:
            return jsonify({"error": f"Unauthorized: {str(e)}"}), 401
    
    return decorated_function

class GraphStorage:
    """Class to handle graph storage operations in Firestore"""
    
    def __init__(self):
        self.db = get_firestore_db()
        self.graphs_collection = self.db.collection('citation_graphs')
        self.users_collection = self.db.collection('users')
    
    def save_graph(self, user_id, graph_data):
        """
        Save a graph to Firestore - ultra simplified
        
        Args:
            user_id: ID of the user who created the graph
            graph_data: Dictionary containing complete graph data
            
        Returns:
            ID of the saved graph document
        """
        try:
            # Create a new document
            doc_ref = self.graphs_collection.document()
            
            # Convert graph_data to JSON string to avoid nested entity issues
            graph_data_json = json.dumps(graph_data)
            
            # Add minimal metadata for listing
            doc_data = {
                'user_id': user_id,
                'created_at': datetime.now(),
                'title': graph_data.get('title', graph_data.get('metadata', {}).get('title', 'Untitled Graph')),
                'graph_data': graph_data_json  # Store as JSON string instead of nested object
            }
            
            # Save to Firestore
            doc_ref.set(doc_data)
            print(f"Saved graph {doc_ref.id} for user {user_id}")
            
            return doc_ref.id
            
        except Exception as e:
            print(f"Error saving graph: {str(e)}")
            traceback.print_exc()
            raise
    
    def get_graph(self, graph_id, user_id=None):
        """
        Retrieve a graph by ID - ultra simplified
        
        Args:
            graph_id: ID of the graph to retrieve
            user_id: If provided, verify the graph belongs to this user
            
        Returns:
            Document containing graph_data or None if not found
        """
        try:
            # Get document
            doc_ref = self.graphs_collection.document(graph_id)
            doc = doc_ref.get()
            
            if not doc.exists:
                print(f"Graph {graph_id} not found")
                return None
                
            # Get document data
            doc_data = doc.to_dict()
            
            # Check ownership if user_id provided
            if user_id and doc_data.get('user_id') != user_id:
                print(f"Graph {graph_id} does not belong to user {user_id}")
                return None
            
            # Parse the JSON string back to graph data
            if 'graph_data' in doc_data and isinstance(doc_data['graph_data'], str):
                try:
                    doc_data['graph_data'] = json.loads(doc_data['graph_data'])
                except json.JSONDecodeError:
                    print(f"Error parsing graph_data JSON for graph {graph_id}")
            
            # Return complete document
            return doc_data
            
        except Exception as e:
            print(f"Error retrieving graph {graph_id}: {str(e)}")
            traceback.print_exc()
            return None
    
    def list_user_graphs(self, user_id):
        """
        Get a list of all graphs created by a user
        
        Args:
            user_id: ID of the user
            
        Returns:
            List of graph metadata (without the full graph data)
        """
        try:
            # Query graphs by user_id
            query = self.graphs_collection.where('user_id', '==', user_id).order_by(
                'created_at', direction=firestore.Query.DESCENDING
            )
            
            docs = query.stream()
            
            # Prepare result list with metadata only
            results = []
            for doc in docs:
                data = doc.to_dict()
                
                # Create a metadata-only version of the document
                metadata = {
                    'id': doc.id,
                    'created_at': data.get('created_at'),
                    'title': data.get('title', 'Untitled Graph')
                }
                
                # Count papers and authors if graph_data exists
                if 'graph_data' in data:
                    graph_data = data['graph_data']
                    # Parse the JSON string if needed
                    if isinstance(graph_data, str):
                        try:
                            graph_data = json.loads(graph_data)
                        except json.JSONDecodeError:
                            graph_data = {}
                    
                    # Count nodes if available
                    if isinstance(graph_data, dict) and 'nodes' in graph_data:
                        nodes = graph_data.get('nodes', [])
                        metadata['paper_count'] = sum(1 for node in nodes if node.get('type') == 'paper')
                        metadata['author_count'] = sum(1 for node in nodes if node.get('type') == 'author')
                    else:
                        metadata['paper_count'] = 0
                        metadata['author_count'] = 0
                else:
                    metadata['paper_count'] = 0
                    metadata['author_count'] = 0
                
                # Don't include the full graph data
                results.append(metadata)
                
            return results
            
        except Exception as e:
            print(f"Error listing user graphs: {str(e)}")
            traceback.print_exc()
            return []
    
    def delete_graph(self, graph_id, user_id):
        """
        Delete a graph
        
        Args:
            graph_id: ID of the graph to delete
            user_id: ID of the user who owns the graph
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get the graph to verify ownership
            doc_ref = self.graphs_collection.document(graph_id)
            doc = doc_ref.get()
            
            if not doc.exists:
                return False
                
            graph_data = doc.to_dict()
            
            # Verify ownership
            if graph_data.get('user_id') != user_id:
                return False
                
            # Delete the document
            doc_ref.delete()
            
            # Update user's graphs list
            user_ref = self.users_collection.document(user_id)
            user_ref.update({
                'graph_ids': firestore.ArrayRemove([graph_id])
            })
            
            return True
            
        except Exception as e:
            print(f"Error deleting graph: {str(e)}")
            return False 