<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260115151539 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE customer ADD phone_number VARCHAR(20) DEFAULT NULL');
        $this->addSql('ALTER TABLE observation ADD observation LONGTEXT DEFAULT NULL, ADD recommendations LONGTEXT DEFAULT NULL, ADD problems LONGTEXT DEFAULT NULL, ADD general_comment LONGTEXT DEFAULT NULL, ADD data JSON NOT NULL, ADD flock_id INT NOT NULL, DROP type, DROP is_resolved, CHANGE description concerns LONGTEXT DEFAULT NULL');
        $this->addSql('ALTER TABLE observation ADD CONSTRAINT FK_C576DBE06DA78CF6 FOREIGN KEY (flock_id) REFERENCES flock (id)');
        $this->addSql('CREATE INDEX IDX_C576DBE06DA78CF6 ON observation (flock_id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE customer DROP phone_number');
        $this->addSql('ALTER TABLE observation DROP FOREIGN KEY FK_C576DBE06DA78CF6');
        $this->addSql('DROP INDEX IDX_C576DBE06DA78CF6 ON observation');
        $this->addSql('ALTER TABLE observation ADD type VARCHAR(255) NOT NULL, ADD description LONGTEXT DEFAULT NULL, ADD is_resolved TINYINT NOT NULL, DROP concerns, DROP observation, DROP recommendations, DROP problems, DROP general_comment, DROP data, DROP flock_id');
    }
}
