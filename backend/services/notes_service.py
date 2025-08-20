from typing import List, Optional, Dict, Any
from uuid import UUID
from supabase import Client
from database import get_supabase
from models.notes import (
    FolderCreate, FolderUpdate, FolderInDB, 
    NoteCreate, NoteUpdate, NoteInDB, NoteWithRelations,
    TagCreate, TagInDB, TemplateInDB, TemplateCreate, TemplateUpdate
)
from services.base_database_service import BaseDatabaseService

class NotesService:
    def __init__(self, supabase: Client = None):
        self.supabase = supabase or get_supabase()
        self.folders = BaseDatabaseService("folders", FolderInDB, self.supabase)
        self.notes = BaseDatabaseService("notes", NoteInDB, self.supabase)
        self.tags = BaseDatabaseService("tags", TagInDB, self.supabase)
        self.templates = BaseDatabaseService("templates", TemplateInDB, self.supabase)
        self.templates = BaseDatabaseService("templates", TemplateInDB, self.supabase)
        
    async def _get_note_with_relations(self, note_id: UUID, user_id: str) -> Optional[NoteWithRelations]:
        """Get a note with its folder, tags, and template relations"""
        # Get the note
        result = await self.supabase.rpc('get_notes', {
            'p_note_id': str(note_id)
        }).execute()
        
        if not result.data or not result.data[0]:
            return None
            
        note_data = result.data[0]
        
        # Get folder
        folder = await self.get_folder(note_data['folder_id']) if note_data.get('folder_id') else None
        
        # Get tags
        tags_result = await self.supabase.rpc('get_note_tags', {
            'p_note_id': str(note_id)
        }).execute()
        
        tags = [TagInDB(**tag) for tag in (tags_result.data or [])]
        
        # Get template if exists
        template = None
        if note_data.get('template_id'):
            template_result = await self.supabase.table('templates')\
                .select('*')\
                .eq('id', str(note_data['template_id']))\
                .single()\
                .execute()
            if template_result.data:
                template = TemplateInDB(**template_result.data)
        
        # Create NoteInDB instance
        note = NoteInDB(
            **{k: v for k, v in note_data.items() if k in NoteInDB.__fields__}
        )
        
        # Create and return NoteWithRelations
        return NoteWithRelations(
            **note.dict(),
            folder=folder,
            tags=tags,
            template=template
        )

    # Folder Operations
    async def create_folder(self, folder: FolderCreate, user_id: str) -> FolderInDB:
        """
        Create a new folder. Note that folders are global and not user-specific.
        Only system folders can be created through the API.
        """
        # Only allow creating system folders through the API
        if not folder.is_system:
            raise ValueError("Only system folders can be created through the API")
            
        # Call the database function to create a system folder
        result = await self.supabase.rpc('create_system_folder', {
            'folder_name': folder.name,
            'folder_slug': folder.slug,
            'folder_description': folder.description
        }).execute()
        
        if not result.data:
            raise ValueError("Failed to create system folder")
            
        # Get the created folder
        return await self.get_folder_by_slug(folder.slug)

    async def get_folder(self, folder_id: UUID) -> Optional[FolderInDB]:
        """Get a folder by ID"""
        result = await self.supabase.table('folders').select('*').eq('id', str(folder_id)).single().execute()
        if not result.data:
            return None
        return FolderInDB(**result.data)
        
    async def get_folder_by_slug(self, slug: str) -> Optional[FolderInDB]:
        """Get a folder by its slug"""
        result = await self.supabase.table('folders').select('*').eq('slug', slug).single().execute()
        if not result.data:
            return None
        return FolderInDB(**result.data)
        
    async def list_folders(
        self, 
        search: Optional[str] = None, 
        is_system: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = 'name',
        sort_order: str = 'ASC'
    ) -> List[FolderInDB]:
        """
        List folders with optional filtering and sorting.
        Uses the get_folders database function.
        """
        # Call the database function
        result = await self.supabase.rpc('get_folders', {
            'search_term': search,
            'is_system_param': is_system,
            'limit_rows': limit,
            'offset_rows': offset,
            'sort_by': sort_by,
            'sort_order': sort_order.upper()
        }).execute()
        
        if not result.data:
            return []
            
        return [FolderInDB(**item) for item in result.data]
        
    # Note: Folder updates and deletions are not allowed as per database design
    # All folder modifications should be done through database migrations

    # Note Operations
    async def create_note(self, note: NoteCreate, user_id: str) -> NoteWithRelations:
        """Create a new note"""
        try:
            result = await self.supabase.rpc('upsert_note', {
                'p_folder_id': str(note.folder_id),
                'p_title': note.title,
                'p_content': note.content,
                'p_is_pinned': note.is_pinned,
                'p_is_favorite': note.is_favorite,
                'p_is_archived': note.is_archived,
                'p_metadata': note.metadata
            }).execute()
            
            if not result.data or not result.data[0]:
                raise ValueError("Failed to create note")
                
            # Handle tags if provided
            if note.tags:
                await self._set_note_tags(UUID(result.data[0]['id']), note.tags, user_id)
                
            return await self._get_note_with_relations(UUID(result.data[0]['id']), user_id)
            
        except Exception as e:
            raise ValueError(f"Error creating note: {str(e)}")
    
    async def toggle_note_favorite(self, note_id: UUID, user_id: str) -> bool:
        """Toggle favorite status of a note"""
        # Verify note exists and belongs to user
        existing_note = await self.get_note(note_id, user_id)
        if not existing_note:
            raise ValueError("Note not found or access denied")
            
        result = await self.supabase.rpc('toggle_note_favorite', {
            'note_id': str(note_id)
        }).execute()
        
        if not result.data or len(result.data) == 0:
            raise ValueError("Failed to toggle favorite status")
            
        return result.data[0].get('toggle_note_favorite', False)
        
    async def _set_note_tags(self, note_id: UUID, tags: List[str], user_id: str) -> None:
        """Set tags for a note, replacing any existing tags"""
        # First, remove all existing tags for this note
        await self.supabase.table('note_tags')\
            .delete()\
            .eq('note_id', str(note_id))\
            .execute()
            
        if not tags:
            return
            
        # Get or create tags and create associations
        for tag_name in set(tags):  # Remove duplicates
            if not tag_name.strip():
                continue
                
            # Get or create tag
            tag_result = await self.supabase.rpc('get_or_create_tag', {
                'p_name': tag_name.strip(),
                'p_user_id': user_id
            }).execute()
            
            if tag_result.data and len(tag_result.data) > 0:
                tag_id = tag_result.data[0]['id']
                
                # Create association
                await self.supabase.table('note_tags')\
                    .insert({
                        'note_id': str(note_id),
                        'tag_id': tag_id,
                        'user_id': user_id
                    })\
                    .execute()
    
    # Template Methods
    async def create_template(self, template: TemplateCreate, user_id: str) -> TemplateInDB:
        """Create a new template"""
        try:
            result = await self.supabase.rpc('create_template', {
                'p_name': template.name,
                'p_description': template.description,
                'p_content': template.content
            }).execute()
            
            if not result.data:
                raise ValueError("Failed to create template")
                
            # Fetch the created template to return full data
            template = await self.get_template(UUID(result.data[0]['create_template']))
            if not template:
                raise ValueError("Failed to fetch created template")
                
            return template
            
        except Exception as e:
            raise ValueError(f"Error creating template: {str(e)}")
    
    async def get_template(self, template_id: UUID) -> Optional[TemplateInDB]:
        """Get a template by ID"""
        try:
            result = await self.supabase.rpc('get_template', {
                'p_template_id': str(template_id)
            }).execute()
            
            if not result.data or not result.data[0]:
                return None
                
            return TemplateInDB(**result.data[0])
            
        except Exception as e:
            logger.error(f"Error getting template: {str(e)}")
            return None
    
    async def list_templates(self, search: Optional[str] = None) -> List[TemplateInDB]:
        """List all templates available to the user"""
        try:
            result = await self.supabase.rpc('get_templates').execute()
            templates = [TemplateInDB(**t) for t in (result.data or [])]
            
            if search:
                search_lower = search.lower()
                templates = [
                    t for t in templates 
                    if (t.name and search_lower in t.name.lower()) or 
                       (t.description and search_lower in t.description.lower())
                ]
                
            return templates
            
        except Exception as e:
            logger.error(f"Error listing templates: {str(e)}")
            return []
    
    async def update_template(
        self, 
        template_id: UUID, 
        template: TemplateUpdate, 
        user_id: str
    ) -> Optional[TemplateInDB]:
        """Update an existing template"""
        try:
            # First verify the template exists and user has permission
            existing = await self.get_template(template_id)
            if not existing:
                return None
                
            # Prepare update data
            update_data = {}
            if template.name is not None:
                update_data['p_name'] = template.name
            if template.description is not None:
                update_data['p_description'] = template.description
            if template.content is not None:
                update_data['p_content'] = template.content
                
            if not update_data:
                return existing
                
            # Call the update function
            result = await self.supabase.rpc('update_template', {
                'p_template_id': str(template_id),
                **update_data
            }).execute()
            
            if not result.data or not result.data[0]:
                return None
                
            # Fetch the updated template
            return await self.get_template(template_id)
            
        except Exception as e:
            logger.error(f"Error updating template: {str(e)}")
            return None
    
    async def delete_template(self, template_id: UUID, user_id: str) -> bool:
        """Delete a template (only user's own non-system templates)"""
        try:
            result = await self.supabase.rpc('delete_template', {
                'p_template_id': str(template_id)
            }).execute()
            
            return result.data and result.data[0] and result.data[0].get('delete_template', False)
            
        except Exception as e:
            logger.error(f"Error deleting template: {str(e)}")
            return False
    
    async def list_notes(
        self,
        user_id: str,
        folder_id: Optional[UUID] = None,
        search: Optional[str] = None,
        is_favorite: Optional[bool] = None,
        is_pinned: Optional[bool] = None,
        is_archived: bool = False,
        include_deleted: bool = False,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = 'updated_at',
        sort_order: str = 'DESC'
    ) -> List[NoteWithRelations]:
        """List notes with filtering and sorting options"""
        result = await self.supabase.rpc('get_notes', {
            'p_folder_id': str(folder_id) if folder_id else None,
            'p_search_term': search,
            'p_is_favorite': is_favorite,
            'p_is_pinned': is_pinned,
            'p_is_archived': is_archived,
            'p_include_deleted': include_deleted,
            'p_limit': limit,
            'p_offset': offset,
            'p_sort_by': sort_by,
            'p_sort_order': sort_order
        }).execute()
        
        if not result.data:
            return []
            
        notes = []
        for note_data in result.data:
            note = await self._get_note_with_relations(note_data['id'], user_id)
            if note:
                notes.append(note)
                
        return notes
        
    async def delete_note(self, note_id: UUID, user_id: str, permanent: bool = False) -> bool:
        """
        Delete a note (soft delete by default, or permanent if specified)
        Returns True if successful, False otherwise
        """
        # First verify the note exists and belongs to the user
        existing_note = await self.get_note(note_id, user_id)
        if not existing_note:
            return False
            
        if permanent:
            # Permanently delete the note (only if already in trash)
            result = await self.supabase.rpc('permanent_delete_note', {
                'p_note_id': str(note_id)
            }).execute()
        else:
            # Soft delete (move to trash)
            result = await self.supabase.rpc('delete_note', {
                'p_note_id': str(note_id)
            }).execute()
            
        return result.data and result.data[0] and result.data[0].get('success', False)

    async def get_note(self, note_id: UUID, user_id: str) -> Optional[NoteWithRelations]:
        """Get a single note by ID with its relations"""
        return await self._get_note_with_relations(note_id, user_id)

    async def update_note(self, note_id: UUID, note: NoteUpdate, user_id: str) -> Optional[NoteWithRelations]:
        """Update an existing note"""
        # First get the existing note to ensure it belongs to the user
        existing_note = await self._get_note_with_relations(note_id, user_id)
        if not existing_note:
            return None
            
        note_data = note.dict(exclude_unset=True, exclude={"tags"})
        
        # Call the upsert_note database function
        result = await self.supabase.rpc('upsert_note', {
            'p_id': str(note_id),
            'p_folder_id': str(note_data.get('folder_id', existing_note.folder_id)),
            'p_title': note_data.get('title', existing_note.title),
            'p_content': note_data.get('content', existing_note.content),
            'p_is_pinned': note_data.get('is_pinned', existing_note.is_pinned),
            'p_is_favorite': note_data.get('is_favorite', existing_note.is_favorite),
            'p_is_archived': note_data.get('is_archived', existing_note.is_archived),
            'p_metadata': note_data.get('metadata')
        }).execute()
        
        if not result.data or not result.data[0]:
            return None
            
        # Handle tags if provided
        if hasattr(note, 'tags') and note.tags is not None:
            await self._set_note_tags(note_id, note.tags, user_id)
            
        # Get the updated note with relations
        return await self._get_note_with_relations(note_id, user_id)

    async def _get_note_with_relations(self, note_id: UUID, user_id: str) -> Optional[NoteWithRelations]:
        """Get a note with its folder, tags, and template relations"""
        # Get the note
        result = await self.supabase.rpc('get_notes', {
            'p_note_id': str(note_id)
        }).execute()
        
        if not result.data or not result.data[0]:
            return None
            
        note_data = result.data[0]
        
        # Get folder
        folder = await self.get_folder(note_data['folder_id']) if note_data.get('folder_id') else None
        
        # Get tags
        tags_result = await self.supabase.rpc('get_note_tags', {
            'p_note_id': str(note_id)
        }).execute()
        tags = [TagInDB(**tag) for tag in (tags_result.data or [])]
        
        # Get template if exists
        template = None
        if note_data.get('template_id'):
            template_result = await self.supabase.table('templates')\
                .select('*')\
                .eq('id', str(note_data['template_id']))\
                .single()\
                .execute()
            if template_result.data:
                template = TemplateInDB(**template_result.data)
        
        # Create note with relations
        note = NoteInDB(**note_data)
        return NoteWithRelations(
            **note.dict(),
            folder=folder,
            tags=tags,
            template=template
        )

    # Note Operations
    async def create_note(self, note: NoteCreate, user_id: str) -> NoteWithRelations:
        """Create a new note with the given data"""
        note_data = note.dict(exclude={"tags"}, exclude_unset=True)
        
        # Call the upsert_note database function with NULL ID to create a new note
        result = await self.supabase.rpc('upsert_note', {
            'p_id': None,  # Will generate a new ID
            'p_folder_id': str(note_data.get('folder_id')),
            'p_title': note_data.get('title', 'Untitled Note'),
            'p_content': note_data.get('content', {}),
            'p_is_pinned': note_data.get('is_pinned', False),
            'p_is_favorite': note_data.get('is_favorite', False),
            'p_is_archived': note_data.get('is_archived', False),
            'p_metadata': note_data.get('metadata')
        }).execute()
        
        if not result.data or not result.data[0]:
            raise ValueError("Failed to create note")
            
        note_id = result.data[0].get('note_id')
        if not note_id:
            raise ValueError("Failed to create note: No ID returned")
            
        # Handle tags if provided
        if note.tags:
            await self._set_note_tags(note_id, note.tags, user_id)
            
        # Get the created note with relations
        return await self._get_note_with_relations(note_id, user_id)

    # Tag Operations
    async def _set_note_tags(self, note_id: UUID, tag_names: List[str], user_id: str) -> None:
        """Set tags for a note, creating any that don't exist"""
        # Clear existing tags for this note
        await self.supabase.table("note_tags") \
            .delete() \
            .eq("note_id", str(note_id)) \
            .execute()
            
        if not tag_names:
            return
            
        # Get or create each tag
        tag_ids = []
        for tag_name in tag_names:
            # Check if tag exists
            result = await self.supabase.table('tags')\
                .select('id')\
                .eq('name', tag_name)\
                .eq('user_id', user_id)\
                .maybe_single()\
                .execute()
                
            if result.data:
                tag_ids.append(result.data['id'])
            else:
                # Create new tag
                new_tag = await self.tags.create({
                    'name': tag_name,
                    'user_id': user_id,
                    'color': self._generate_tag_color()
                })
                tag_ids.append(new_tag.id)
        
        # Create note-tag associations
        for tag_id in tag_ids:
            await self.supabase.table('note_tags').insert({
                'note_id': str(note_id),
                'tag_id': str(tag_id)
            }).execute()
    
    def _generate_tag_color(self) -> str:
        """Generate a random color for a new tag"""
        import random
        colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD',
            '#D4A5A5', '#9B8B94', '#E2C2B9', '#F1BF98', '#E09F3E'
        ]
        return random.choice(colors)
            

    async def get_note_tags(self, note_id: UUID, user_id: str) -> List[TagInDB]:
        """Get all tags for a specific note"""
        # First verify the note exists and belongs to the user
        note = await self.get_note(note_id, user_id)
        if not note:
            return []
            
        result = await self.supabase.rpc('get_note_tags', {
            'p_note_id': str(note_id)
        }).execute()
        
        if not result.data:
            return []
            
        return [TagInDB(**tag) for tag in result.data]
