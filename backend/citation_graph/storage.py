# backend/citation_graph/storage.py

import os
import json
import time
import uuid
from collections import defaultdict
import firebase_admin
from firebase_admin import auth, credentials, initialize_app
from google.cloud import storage

class GraphStorage:
    def __init__(self):
        self.is_local_mode = False
        
        # Set up Firebase Admin SDK for authentication
        try:
            # Check if we're running locally
            if os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'):
                # Use explicit credentials file
                cred = credentials.Certificate(os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'))
            else:
                # Use default credentials (App Engine, Cloud Run, etc.)
                cred = credentials.ApplicationDefault()
                
            # Initialize Firebase
            try:
                firebase_admin.get_app()
                print("Firebase app already initialized")
            except ValueError:
                initialize_app(cred)
                print("Initialized Firebase app")
                
        except Exception as e:
            print(f"Firebase initialization error: {e}")
            print("Falling back to local development mode")
            self.is_local_mode = True
        
        # Initialize storage
        try:
            # Get project ID
            project_id = os.environ.get('PROJECT_ID', 'researchgraph-ps-2025')
            self.bucket_name = os.environ.get('STORAGE_BUCKET_NAME', f"{project_id}.appspot.com")
            
            # Initialize storage client
            if self.is_local_mode:
                print("Using local mock storage")
                self.mock_storage = defaultdict(dict)
            else:
                self.client = storage.Client()
                self.bucket = self.client.bucket(self.bucket_name)
                print(f"Initialized graph storage with bucket: {self.bucket_name}")
                
        except Exception as e:
            print(f"Storage initialization error: {e}")
            print("Falling back to local development mode")
            self.is_local_mode = True
            self.mock_storage = defaultdict(dict)
    
    def verify_token(self, id_token):
        """Verify Firebase ID token and return user ID"""
        # In local mode, just return a test user ID
        if self.is_local_mode:
            return "test-user-123"
            
        try:
            decoded_token = auth.verify_id_token(id_token)
            return decoded_token['uid']
        except Exception as e:
            print(f"Token verification error: {e}")
            return None
    
    def get_user_graphs(self, user_id):
        """Get list of graphs for a user"""
        # In local mode, return from mock storage
        if self.is_local_mode:
            # Return only metadata objects
            return [meta for key, meta in self.mock_storage.get(user_id, {}).items() 
                   if key.endswith('_metadata')]
            
        # In production mode, use GCS
        prefix = f"users/{user_id}/graphs/"
        blobs = self.client.list_blobs(self.bucket_name, prefix=prefix)
        
        graphs = []
        for blob in blobs:
            if blob.name.endswith('metadata.json'):
                try:
                    metadata = json.loads(blob.download_as_string())
                    graphs.append(metadata)
                except Exception as e:
                    print(f"Error loading metadata from {blob.name}: {e}")
        
        # Sort by last modified time (newest first)
        graphs.sort(key=lambda x: x.get('last_modified', 0), reverse=True)
        return graphs
    
    def save_graph(self, user_id, title, graph_data):
        """Save a graph for a user"""
        # Generate a unique ID for the graph
        graph_id = str(uuid.uuid4())
        
        # Create metadata
        metadata = {
            "graph_id": graph_id,
            "title": title,
            "created": int(time.time()),
            "last_modified": int(time.time()),
            "node_count": len(graph_data.get("nodes", [])),
            "edge_count": len(graph_data.get("edges", [])),
            "seed_paper": self._get_seed_paper(graph_data),
        }
        
        # In local mode, save to mock storage
        if self.is_local_mode:
            self.mock_storage[user_id][graph_id] = graph_data
            self.mock_storage[user_id][f"{graph_id}_metadata"] = metadata
            print(f"Saved graph {graph_id} to local storage for user {user_id}")
            return {"graph_id": graph_id, "metadata": metadata}
        
        # In production mode, save to GCS
        try:
            # Save graph data
            graph_blob = self.bucket.blob(f"users/{user_id}/graphs/{graph_id}.json")
            graph_blob.upload_from_string(json.dumps(graph_data), content_type='application/json')
            
            # Save metadata
            metadata_blob = self.bucket.blob(f"users/{user_id}/graphs/{graph_id}_metadata.json")
            metadata_blob.upload_from_string(json.dumps(metadata), content_type='application/json')
            
            return {"graph_id": graph_id, "metadata": metadata}
        except Exception as e:
            print(f"Error saving graph: {e}")
            return {"error": str(e)}
    
    def get_graph(self, user_id, graph_id):
        """Get a specific graph for a user"""
        # In local mode, retrieve from mock storage
        if self.is_local_mode:
            return self.mock_storage.get(user_id, {}).get(graph_id)
        
        # In production mode, retrieve from GCS
        blob = self.bucket.blob(f"users/{user_id}/graphs/{graph_id}.json")
        
        if not blob.exists():
            return None
            
        try:
            graph_data = json.loads(blob.download_as_string())
            return graph_data
        except Exception as e:
            print(f"Error loading graph {graph_id}: {e}")
            return None
    
    def delete_graph(self, user_id, graph_id):
        """Delete a graph for a user"""
        # In local mode, delete from mock storage
        if self.is_local_mode:
            if graph_id in self.mock_storage.get(user_id, {}):
                del self.mock_storage[user_id][graph_id]
            if f"{graph_id}_metadata" in self.mock_storage.get(user_id, {}):
                del self.mock_storage[user_id][f"{graph_id}_metadata"]
            return True
        
        # In production mode, delete from GCS
        try:
            # Delete graph data
            graph_blob = self.bucket.blob(f"users/{user_id}/graphs/{graph_id}.json")
            if graph_blob.exists():
                graph_blob.delete()
                
            # Delete metadata
            metadata_blob = self.bucket.blob(f"users/{user_id}/graphs/{graph_id}_metadata.json")
            if metadata_blob.exists():
                metadata_blob.delete()
                
            return True
        except Exception as e:
            print(f"Error deleting graph: {e}")
            return False
    
    def _get_seed_paper(self, graph_data):
        """Extract seed paper title from graph data"""
        # Try to find a paper with the highest degree (likely the seed)
        nodes = graph_data.get("nodes", [])
        edges = graph_data.get("edges", [])
        
        if not nodes:
            return "Unknown"
            
        # Build degree counts
        degree_count = {}
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            
            if source:
                degree_count[source] = degree_count.get(source, 0) + 1
            if target:
                degree_count[target] = degree_count.get(target, 0) + 1
                
        # Find paper with highest degree
        max_degree = 0
        seed_id = None
        
        for node_id, degree in degree_count.items():
            if degree > max_degree:
                max_degree = degree
                seed_id = node_id
                
        # Get paper title
        if seed_id:
            for node in nodes:
                if node.get("id") == seed_id and node.get("type") == "paper":
                    return node.get("title", "Unknown")
        
        # Fallback to first paper node
        for node in nodes:
            if node.get("type") == "paper":
                return node.get("title", "Unknown")
                
        return "Unknown"