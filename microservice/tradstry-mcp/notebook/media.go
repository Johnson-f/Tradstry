package notebook

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/graphql"
	"tradstry-mcp/oauth"
)

type viewMediaInput struct {
	NoteID string `json:"note_id" jsonschema:"ID from list_notes or search_notes"`
	Hash   string `json:"hash" jsonschema:"from get_note's media list"`
}

type viewMediaOutput struct {
	Hash  string `json:"hash"`
	Type  string `json:"type" jsonschema:"image or video"`
	Shown string `json:"shown" jsonschema:"image, or thumbnail when the file is a video or too large to show"`
}

func (t *tools) viewMedia(ctx context.Context, req *mcp.CallToolRequest, in viewMediaInput) (*mcp.CallToolResult, viewMediaOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, viewMediaOutput{}, err
	}
	d, err := t.api.document(ctx, caller.Token, in.NoteID)
	if err != nil {
		return nil, viewMediaOutput{}, forUser(err)
	}
	var found *media
	for i := range d.Media {
		if strings.EqualFold(d.Media[i].Hash, in.Hash) {
			found = &d.Media[i]
		}
	}
	if found == nil {
		return nil, viewMediaOutput{}, errors.New("that file is not in this note; use a hash from get_note's media list")
	}

	out := viewMediaOutput{Hash: found.Hash, Type: found.MediaType, Shown: "image"}
	var body []byte
	var contentType string
	if found.MediaType == "image" {
		body, contentType, err = t.api.mediaFile(ctx, caller.Token, found.Hash, false)
	}
	if found.MediaType != "image" || errors.Is(err, graphql.ErrTooLarge) {
		out.Shown = "thumbnail"
		body, contentType, err = t.api.mediaFile(ctx, caller.Token, found.Hash, true)
	}
	if errors.Is(err, graphql.ErrNotFound) {
		return nil, viewMediaOutput{}, errors.New("this file has no preview yet; try again in a minute")
	}
	if err != nil {
		return nil, viewMediaOutput{}, graphql.ForUser(err)
	}
	if !strings.HasPrefix(contentType, "image/") {
		return nil, viewMediaOutput{}, fmt.Errorf("this file cannot be shown as an image (%s)", contentType)
	}

	caption := fmt.Sprintf("%s from “%s”", found.MediaType, d.Title)
	if found.MediaType == "video" {
		caption = fmt.Sprintf("Thumbnail of a %.0f-second video from “%s”", found.DurationSeconds, d.Title)
	}
	return &mcp.CallToolResult{Content: []mcp.Content{
		&mcp.ImageContent{Data: body, MIMEType: contentType},
		&mcp.TextContent{Text: caption},
	}}, out, nil
}
